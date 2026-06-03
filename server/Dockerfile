# Multi-stage build for the Go game server. Produces a tiny static image.
FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -o /bin/server ./cmd/server

FROM gcr.io/distroless/static-debian12
COPY --from=build /bin/server /server
EXPOSE 8080
ENV PORT=8080
ENTRYPOINT ["/server"]
