// Package auth verifies Firebase ID tokens server-side without the heavy
// Admin SDK. Firebase ID tokens are RS256 JWTs; we check the signature against
// Google's rotating public certs and validate the standard Firebase claims
// (aud = projectID, iss = securetoken.google.com/<projectID>, exp/iat). This is
// the same trust model as /api/economy, applied to the WebSocket handshake.
package auth

import (
	"context"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// googleCertsURL serves x509 certs keyed by `kid`, with a Cache-Control max-age.
const googleCertsURL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"

// Verifier validates Firebase ID tokens for one project. Safe for concurrent use.
type Verifier struct {
	projectID string
	client    *http.Client
	now       func() time.Time

	mu      sync.RWMutex
	keys    map[string]*rsa.PublicKey
	expires time.Time
}

func NewVerifier(projectID string) *Verifier {
	return &Verifier{
		projectID: projectID,
		client:    &http.Client{Timeout: 10 * time.Second},
		now:       time.Now,
		keys:      map[string]*rsa.PublicKey{},
	}
}

// Verify checks the token and returns the uid (the `sub` claim) on success.
func (v *Verifier) Verify(ctx context.Context, token string) (string, error) {
	parsed, err := jwt.Parse(token, func(t *jwt.Token) (interface{}, error) {
		if t.Method.Alg() != "RS256" {
			return nil, fmt.Errorf("unexpected alg %q", t.Method.Alg())
		}
		kid, _ := t.Header["kid"].(string)
		if kid == "" {
			return nil, errors.New("missing kid")
		}
		return v.keyForKid(ctx, kid)
	},
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithAudience(v.projectID),
		jwt.WithIssuer("https://securetoken.google.com/"+v.projectID),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return "", err
	}
	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok || !parsed.Valid {
		return "", errors.New("invalid claims")
	}
	sub, _ := claims["sub"].(string)
	if sub == "" {
		return "", errors.New("empty sub")
	}
	return sub, nil
}

func (v *Verifier) keyForKid(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	v.mu.RLock()
	if v.now().Before(v.expires) {
		if k, ok := v.keys[kid]; ok {
			v.mu.RUnlock()
			return k, nil
		}
	}
	v.mu.RUnlock()

	if err := v.refresh(ctx); err != nil {
		return nil, err
	}

	v.mu.RLock()
	defer v.mu.RUnlock()
	if k, ok := v.keys[kid]; ok {
		return k, nil
	}
	return nil, fmt.Errorf("no key for kid %q", kid)
}

func (v *Verifier) refresh(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, googleCertsURL, nil)
	if err != nil {
		return err
	}
	resp, err := v.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("certs fetch: status %d", resp.StatusCode)
	}
	var certs map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&certs); err != nil {
		return err
	}
	keys, err := parseCerts(certs)
	if err != nil {
		return err
	}

	v.mu.Lock()
	v.keys = keys
	v.expires = v.now().Add(maxAge(resp.Header.Get("Cache-Control")))
	v.mu.Unlock()
	return nil
}

// setKeys injects keys directly (used in tests to avoid network).
func (v *Verifier) setKeys(keys map[string]*rsa.PublicKey, ttl time.Duration) {
	v.mu.Lock()
	v.keys = keys
	v.expires = v.now().Add(ttl)
	v.mu.Unlock()
}

func parseCerts(certs map[string]string) (map[string]*rsa.PublicKey, error) {
	out := make(map[string]*rsa.PublicKey, len(certs))
	for kid, pemStr := range certs {
		block, _ := pem.Decode([]byte(pemStr))
		if block == nil {
			continue
		}
		cert, err := x509.ParseCertificate(block.Bytes)
		if err != nil {
			continue
		}
		if pub, ok := cert.PublicKey.(*rsa.PublicKey); ok {
			out[kid] = pub
		}
	}
	if len(out) == 0 {
		return nil, errors.New("no usable certs")
	}
	return out, nil
}

func maxAge(cacheControl string) time.Duration {
	const fallback = time.Hour
	for _, part := range strings.Split(cacheControl, ",") {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "max-age=") {
			if secs, err := strconv.Atoi(strings.TrimPrefix(part, "max-age=")); err == nil && secs > 0 {
				return time.Duration(secs) * time.Second
			}
		}
	}
	return fallback
}
