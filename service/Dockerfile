FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download || true
COPY cmd ./cmd
COPY internal ./internal
COPY migrations ./migrations
COPY openapi ./openapi
# Ensure go.sum is populated with imports discovered from source
RUN --mount=type=cache,target=/go/pkg/mod go mod tidy
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/service ./cmd/service

FROM gcr.io/distroless/static-debian12
WORKDIR /
COPY --from=builder /out/service /service
COPY --from=builder /app/migrations /migrations
COPY --from=builder /app/openapi /openapi
USER 65532:65532
EXPOSE 8088
ENTRYPOINT ["/service"]
