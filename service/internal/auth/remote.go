package auth

import (
    "encoding/json"
    "io"
    "net/http"
    "strings"

    "github.com/gofiber/fiber/v2"
)

type Options struct {
    CoreAPIBase string
}

const userKey = "userID"

// Middleware verifies auth by delegating to the Core API `/v1/auth/verify`.
// It forwards Authorization header and cookies from the incoming request.
func Middleware(opts Options) fiber.Handler {
    client := &http.Client{}
    return func(c *fiber.Ctx) error {
        apiURL := strings.TrimRight(opts.CoreAPIBase, "/") + "/v1/auth/verify"
        req, _ := http.NewRequest(http.MethodGet, apiURL, nil)

        if authz := c.Get("Authorization"); authz != "" {
            req.Header.Set("Authorization", authz)
        }
        if cookie := c.Get("Cookie"); cookie != "" {
            req.Header.Set("Cookie", cookie)
        }
        if origin := c.Get("Origin"); origin != "" {
            req.Header.Set("Origin", origin)
        }
        req.Header.Set("Accept", "application/json")

        resp, err := client.Do(req)
        if err != nil {
            return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "auth verify failed"})
        }
        defer resp.Body.Close()

        if resp.StatusCode != http.StatusOK {
            // pass through response body if available
            b, _ := io.ReadAll(resp.Body)
            msg := strings.TrimSpace(string(b))
            if msg == "" { msg = "unauthorized" }
            return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": msg})
        }

        // Try to extract user id from response body
        var body map[string]any
        if err := json.NewDecoder(resp.Body).Decode(&body); err == nil {
            // common shapes: { data: { id: "..." }} or { user: { id: "..." } }
            if data, ok := body["data"].(map[string]any); ok {
                if id, ok := data["id"].(string); ok { c.Locals(userKey, id) }
                if user, ok := data["user"].(map[string]any); ok {
                    if id, ok := user["id"].(string); ok { c.Locals(userKey, id) }
                }
            }
            if user, ok := body["user"].(map[string]any); ok {
                if id, ok := user["id"].(string); ok { c.Locals(userKey, id) }
            }
            if sub, ok := body["sub"].(string); ok && sub != "" {
                c.Locals(userKey, sub)
            }
        }
        return c.Next()
    }
}

func UserID(c *fiber.Ctx) string {
    if v := c.Locals(userKey); v != nil {
        if s, ok := v.(string); ok { return s }
    }
    return ""
}

