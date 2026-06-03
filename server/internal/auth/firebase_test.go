package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func sign(t *testing.T, key *rsa.PrivateKey, kid string, claims jwt.MapClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = kid
	s, err := tok.SignedString(key)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	return s
}

func validClaims() jwt.MapClaims {
	now := time.Now()
	return jwt.MapClaims{
		"aud": "proj",
		"iss": "https://securetoken.google.com/proj",
		"sub": "uid-123",
		"iat": now.Add(-time.Minute).Unix(),
		"exp": now.Add(time.Hour).Unix(),
	}
}

func newTestVerifier(t *testing.T) (*Verifier, *rsa.PrivateKey) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("genkey: %v", err)
	}
	v := NewVerifier("proj")
	v.setKeys(map[string]*rsa.PublicKey{"k1": &key.PublicKey}, time.Hour)
	return v, key
}

func TestVerifyValid(t *testing.T) {
	v, key := newTestVerifier(t)
	tok := sign(t, key, "k1", validClaims())
	uid, err := v.Verify(context.Background(), tok)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if uid != "uid-123" {
		t.Fatalf("uid = %q, want uid-123", uid)
	}
}

func TestVerifyWrongAudience(t *testing.T) {
	v, key := newTestVerifier(t)
	c := validClaims()
	c["aud"] = "other-project"
	if _, err := v.Verify(context.Background(), sign(t, key, "k1", c)); err == nil {
		t.Fatal("expected wrong-audience rejection")
	}
}

func TestVerifyWrongIssuer(t *testing.T) {
	v, key := newTestVerifier(t)
	c := validClaims()
	c["iss"] = "https://evil.example.com/proj"
	if _, err := v.Verify(context.Background(), sign(t, key, "k1", c)); err == nil {
		t.Fatal("expected wrong-issuer rejection")
	}
}

func TestVerifyExpired(t *testing.T) {
	v, key := newTestVerifier(t)
	c := validClaims()
	c["exp"] = time.Now().Add(-time.Hour).Unix()
	if _, err := v.Verify(context.Background(), sign(t, key, "k1", c)); err == nil {
		t.Fatal("expected expired rejection")
	}
}

func TestVerifyBadSignature(t *testing.T) {
	v, _ := newTestVerifier(t)
	other, _ := rsa.GenerateKey(rand.Reader, 2048)
	// Signed with a different key but claiming kid k1 -> signature mismatch.
	tok := sign(t, other, "k1", validClaims())
	if _, err := v.Verify(context.Background(), tok); err == nil {
		t.Fatal("expected bad-signature rejection")
	}
}

func TestMaxAgeParsing(t *testing.T) {
	if got := maxAge("public, max-age=3600, must-revalidate"); got != time.Hour {
		t.Fatalf("maxAge = %v, want 1h", got)
	}
	if got := maxAge("no-cache"); got != time.Hour {
		t.Fatalf("maxAge fallback = %v, want 1h", got)
	}
}
