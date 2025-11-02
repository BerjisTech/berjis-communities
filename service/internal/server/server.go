package server

import (
    "database/sql"
    "io"
    "net/http"
    "os"
    "path/filepath"
    "strconv"
    "strings"
    "time"

    "github.com/gofiber/fiber/v2"
    "github.com/gofiber/fiber/v2/middleware/cors"
    "github.com/google/uuid"
    "github.com/jmoiron/sqlx"

    srvAuth "github.com/berjistech/berjis-ecosystem/communities/service/internal/auth"
    "github.com/berjistech/berjis-ecosystem/communities/service/internal/billing"
)

type Options struct {
	AllowedOrigins    string
	CoreAPIBase       string
	DB                *sqlx.DB
	UploadsPublicBase string
}

type Community struct {
	ID          int64    `db:"id" json:"id"`
	Name        string   `db:"name" json:"name"`
	Slug        string   `db:"slug" json:"slug"`
	Visibility  string   `db:"visibility" json:"visibility"`
	Access      string   `db:"access" json:"access"`
	Description string   `db:"description" json:"description"`
	Hashtags    []string `json:"hashtags"`
}

type Group struct {
	ID          int64  `db:"id" json:"id"`
	Name        string `db:"name" json:"name"`
	Slug        string `db:"slug" json:"slug"`
	Description string `db:"description" json:"description"`
	Visibility  string `db:"visibility" json:"visibility"`
}

func New(opts Options) *fiber.App {
	app := fiber.New()
	app.Use(cors.New(cors.Config{
		AllowOrigins:     opts.AllowedOrigins,
		AllowMethods:     "GET,POST,PUT,PATCH,DELETE,OPTIONS",
		AllowHeaders:     "Authorization,Content-Type,Accept",
		AllowCredentials: true,
	}))

	// Health
	app.Get("/v1/health", func(c *fiber.Ctx) error { return c.JSON(fiber.Map{"success": true, "message": "ok"}) })
	// OpenAPI serve
	app.Get("/openapi/v1.yaml", func(c *fiber.Ctx) error {
		return c.SendFile("/openapi/communities.v1.yaml", true)
	})
	app.Get("/openapi", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"success": true, "message": "see /openapi/v1.yaml"})
	})

	// Serve uploaded media
	_ = os.MkdirAll("/data/uploads", 0755)
	app.Static("/uploads", "/data/uploads")

	// Public list and get
	app.Get("/v1/communities", func(c *fiber.Ctx) error { return listCommunities(c, opts.DB) })
	app.Get("/v1/communities/:id", func(c *fiber.Ctx) error { return getCommunity(c, opts.DB) })
	app.Get("/v1/communities/by-slug/:slug", func(c *fiber.Ctx) error { return getCommunityBySlug(c, opts.DB) })

	// Protected routes: create/join/leave
	requireAuth := srvAuth.Middleware(srvAuth.Options{CoreAPIBase: opts.CoreAPIBase})
	app.Post("/v1/communities", requireAuth, func(c *fiber.Ctx) error { return createCommunity(c, opts.DB) })
	app.Patch("/v1/communities/:id", requireAuth, func(c *fiber.Ctx) error { return updateCommunity(c, opts.DB) })
	app.Delete("/v1/communities/:id", requireAuth, func(c *fiber.Ctx) error { return deleteCommunity(c, opts.DB) })
	app.Post("/v1/communities/:id/join", requireAuth, func(c *fiber.Ctx) error { return joinCommunity(c, opts.DB, opts.CoreAPIBase) })
	app.Post("/v1/communities/:id/leave", requireAuth, func(c *fiber.Ctx) error { return c.JSON(fiber.Map{"success": true, "message": "left"}) })
	// Admin: roles and bans (server enforces permissions)
	app.Post("/v1/communities/:id/members/:userId/role", requireAuth, func(c *fiber.Ctx) error { return setCommunityMemberRole(c, opts.DB) })
	app.Post("/v1/communities/:id/bans/:userId", requireAuth, func(c *fiber.Ctx) error { return communityBanAction(c, opts.DB) })

	// Channels
	app.Get("/v1/communities/:id/channels", func(c *fiber.Ctx) error { return listChannels(c, opts.DB) })
	app.Post("/v1/communities/:id/channels", requireAuth, func(c *fiber.Ctx) error { return createChannel(c, opts.DB) })
	app.Get("/v1/channels/:channelId", func(c *fiber.Ctx) error { return getChannel(c, opts.DB) })

	// Posts
	app.Get("/v1/channels/:channelId/posts", func(c *fiber.Ctx) error { return listPosts(c, opts.DB) })
	app.Post("/v1/channels/:channelId/posts", requireAuth, func(c *fiber.Ctx) error { return createPost(c, opts.DB) })

	// Tags suggest
	app.Get("/v1/tags/suggest", func(c *fiber.Ctx) error { return tagsSuggest(c, opts.DB) })

	// Generic posts (standalone or tied to group/community/channel)
	app.Post("/v1/posts", requireAuth, func(c *fiber.Ctx) error { return createGenericPost(c, opts.DB) })
	// Stories feed (requires login)
	app.Get("/v1/stories", requireAuth, func(c *fiber.Ctx) error { return storiesFeed(c, opts.DB) })
	app.Post("/v1/posts/:id/like", requireAuth, func(c *fiber.Ctx) error { return likePost(c, opts.DB) })
	app.Delete("/v1/posts/:id/like", requireAuth, func(c *fiber.Ctx) error { return unlikePost(c, opts.DB) })
	app.Post("/v1/posts/:id/react", requireAuth, func(c *fiber.Ctx) error { return reactPost(c, opts.DB) })
	app.Delete("/v1/posts/:id/react", requireAuth, func(c *fiber.Ctx) error { return unreactPost(c, opts.DB) })
	app.Post("/v1/posts/:id/view", func(c *fiber.Ctx) error { return viewPost(c, opts.DB) })

	// Comments
	app.Get("/v1/posts/:id/comments", func(c *fiber.Ctx) error { return listComments(c, opts.DB) })
	app.Post("/v1/posts/:id/comments", requireAuth, func(c *fiber.Ctx) error { return createComment(c, opts.DB) })

	// Uploads
	publicUploads := strings.TrimRight(opts.UploadsPublicBase, "/")
	if publicUploads == "" {
		publicUploads = "/uploads"
	}

	app.Post("/v1/uploads", requireAuth, uploadHandler(publicUploads))
	app.Get("/v1/feed/public", func(c *fiber.Ctx) error { return publicFeed(c, opts.DB) })
	app.Get("/v1/explore", func(c *fiber.Ctx) error { return exploreByTag(c, opts.DB) })

	// Users mini proxy (to Core API)
	app.Get("/v1/users/mini", func(c *fiber.Ctx) error { return usersMiniProxy(c, opts.CoreAPIBase) })

	// Groups
	app.Get("/v1/groups", func(c *fiber.Ctx) error { return listGroups(c, opts.DB) })
	app.Post("/v1/groups", requireAuth, func(c *fiber.Ctx) error { return createGroup(c, opts.DB) })
	app.Get("/v1/groups/:id", func(c *fiber.Ctx) error { return getGroup(c, opts.DB) })
	app.Get("/v1/groups/by-slug/:slug", func(c *fiber.Ctx) error { return getGroupBySlug(c, opts.DB) })
	app.Post("/v1/groups/:id/join", requireAuth, func(c *fiber.Ctx) error { return joinGroup(c, opts.DB) })
	app.Post("/v1/groups/:id/members/:userId/role", requireAuth, func(c *fiber.Ctx) error { return setGroupMemberRole(c, opts.DB) })
	app.Post("/v1/groups/:id/bans/:userId", requireAuth, func(c *fiber.Ctx) error { return groupBanAction(c, opts.DB) })

	return app
}

func listCommunities(c *fiber.Ctx, db *sqlx.DB) error {
	q := strings.TrimSpace(c.Query("q"))
	tag := strings.TrimSpace(c.Query("tag"))

	where := []string{"1=1"}
	args := []any{}
	idx := 1
	if q != "" {
		where = append(where, "(LOWER(name) LIKE LOWER($"+strconv.Itoa(idx)+") OR LOWER(description) LIKE LOWER($"+strconv.Itoa(idx)+"))")
		args = append(args, "%"+q+"%")
		idx++
	}
	if tag != "" {
		where = append(where, "EXISTS (SELECT 1 FROM community_tags ct JOIN tags t ON t.id=ct.tag_id WHERE ct.community_id=c.id AND LOWER(t.name)=LOWER($"+strconv.Itoa(idx)+"))")
		args = append(args, strings.TrimPrefix(tag, "#"))
		idx++
	}
	query := "SELECT c.id, c.name, c.slug, c.description, c.visibility, c.access FROM communities c WHERE " + strings.Join(where, " AND ") + " ORDER BY c.id DESC LIMIT 200"
	rows, err := db.Queryx(query, args...)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
	}
	defer rows.Close()

	list := []Community{}
	ids := []int64{}
	for rows.Next() {
		var cm Community
		if err := rows.StructScan(&cm); err != nil {
			continue
		}
		list = append(list, cm)
		ids = append(ids, cm.ID)
	}
	// fetch tags per community (simple approach)
	for i := range list {
		list[i].Hashtags, _ = fetchCommunityTags(db, list[i].ID)
	}
	return c.JSON(fiber.Map{"success": true, "message": "ok", "data": list})
}

func getCommunity(c *fiber.Ctx, db *sqlx.DB) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}
	var cm Community
	err = db.Get(&cm, "SELECT id, name, slug, description, visibility, access FROM communities WHERE id=$1", id)
	if err != nil {
		if err == sql.ErrNoRows {
			return c.SendStatus(fiber.StatusNotFound)
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
	}
	tags, _ := fetchCommunityTags(db, id)
	cm.Hashtags = tags
	return c.JSON(fiber.Map{"success": true, "message": "ok", "data": cm})
}

func createCommunity(c *fiber.Ctx, db *sqlx.DB) error {
	var req Community
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid json"})
	}
	if strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.Slug) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "name and slug required"})
	}
	if req.Visibility == "" {
		req.Visibility = "public"
	}
	if req.Access == "" {
		req.Access = "free"
	}

	// normalize hashtags
	tags := []string{}
	for _, t := range req.Hashtags {
		t = strings.TrimSpace(strings.TrimPrefix(t, "#"))
		if t != "" {
			tags = append(tags, t)
		}
	}

	tx, err := db.Beginx()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
	}
	defer tx.Rollback()

	if err := tx.QueryRowx("INSERT INTO communities (name, slug, description, visibility, access) VALUES ($1,$2,$3,$4,$5) RETURNING id", req.Name, req.Slug, req.Description, req.Visibility, req.Access).Scan(&req.ID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "insert failed"})
	}
	// make creator owner if identified
    if uid := userIDFromContext(c); uid != "" {
    if _, err := tx.Exec("INSERT INTO community_members(community_id, user_id, role) VALUES ($1,$2,'owner') ON CONFLICT DO NOTHING", req.ID, uid); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "owner assign failed"})
		}
	}
	for _, t := range tags {
		var tagID int64
		if err := tx.QueryRowx("INSERT INTO tags(name) VALUES ($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id", t).Scan(&tagID); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "tag upsert failed"})
		}
		if _, err := tx.Exec("INSERT INTO community_tags(community_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", req.ID, tagID); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "tag link failed"})
		}
	}
	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "commit failed"})
	}
	req.Hashtags, _ = fetchCommunityTags(db, req.ID)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"success": true, "message": "created", "data": req})
}

func joinCommunity(c *fiber.Ctx, db *sqlx.DB, coreAPIBase string) error {
	// Enforce access rules: public/private and free/paid
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}

	var cm Community
	if err := db.Get(&cm, "SELECT id, name, slug, visibility, access, description FROM communities WHERE id=$1", id); err != nil {
		if err == sql.ErrNoRows {
			return c.SendStatus(fiber.StatusNotFound)
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
	}

	// Check if already member
	var exists bool
    if err := db.Get(&exists, "SELECT EXISTS (SELECT 1 FROM community_members WHERE community_id=$1 AND user_id=$2)", id, userIDFromContext(c)); err == nil && exists {
		return c.JSON(fiber.Map{"success": true, "message": "already a member"})
	}

	// Private communities: require invite (not implemented) => reject for now
	if strings.ToLower(cm.Visibility) == "private" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "invite required for private community"})
	}

	// Paid communities: require billing intent before membership
	if strings.ToLower(cm.Access) == "paid" {
		// Use Core API billing to create a payment intent and return it to client
		amount := int64(500) // placeholder KES 5.00 or configure via env/plan later
		currency := "KES"
		provider := "mpesa"
		payload := billing.CreateIntentRequest{AmountCents: amount, Currency: currency, Description: "Join community: " + cm.Slug, Provider: provider}
		// Build a net/http.Request proxy from Fiber
		r := new(http.Request)
		r.Header = http.Header{}
		if authz := c.Get("Authorization"); authz != "" {
			r.Header.Set("Authorization", authz)
		}
		if cookie := c.Get("Cookie"); cookie != "" {
			r.Header.Set("Cookie", cookie)
		}
		if origin := c.Get("Origin"); origin != "" {
			r.Header.Set("Origin", origin)
		}
		if resp, status, err := billing.CreatePaymentIntent(coreAPIBase, r, payload); err == nil && status >= 200 && status < 300 {
			return c.Status(fiber.StatusPaymentRequired).JSON(fiber.Map{"success": false, "message": "payment required", "data": resp.Data})
		}
		return c.Status(fiber.StatusPaymentRequired).JSON(fiber.Map{"success": false, "message": "payment required"})
	}

	// Free + public: add membership (if not banned)
	if isBannedFromCommunity(db, id, userIDFromContext(c)) {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "banned from this community"})
	}
    if _, err := db.Exec("INSERT INTO community_members(community_id, user_id, role) VALUES ($1,$2,'member') ON CONFLICT DO NOTHING", id, userIDFromContext(c)); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "join failed"})
	}
	return c.JSON(fiber.Map{"success": true, "message": "joined"})
}

func userIDFromContext(c *fiber.Ctx) string {
    return srvAuth.UserID(c)
}

func fetchCommunityTags(db *sqlx.DB, communityID int64) ([]string, error) {
	rows, err := db.Queryx("SELECT t.name FROM community_tags ct JOIN tags t ON t.id=ct.tag_id WHERE ct.community_id=$1 ORDER BY t.name", communityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err == nil {
			out = append(out, name)
		}
	}
	return out, nil
}

func getCommunityBySlug(c *fiber.Ctx, db *sqlx.DB) error {
	slug := strings.TrimSpace(c.Params("slug"))
	if slug == "" {
		return c.SendStatus(fiber.StatusNotFound)
	}
	var cm Community
	err := db.Get(&cm, "SELECT id, name, slug, description, visibility, access FROM communities WHERE slug=$1", slug)
	if err != nil {
		if err == sql.ErrNoRows {
			return c.SendStatus(fiber.StatusNotFound)
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
	}
	tags, _ := fetchCommunityTags(db, cm.ID)
	cm.Hashtags = tags
	var role string
    _ = db.Get(&role, "SELECT role FROM community_members WHERE community_id=$1 AND user_id=$2", cm.ID, userIDFromContext(c))
    banned := isBannedFromCommunity(db, cm.ID, userIDFromContext(c))
	return c.JSON(fiber.Map{"success": true, "message": "ok", "data": fiber.Map{
		"id": cm.ID, "name": cm.Name, "slug": cm.Slug, "description": cm.Description, "visibility": cm.Visibility, "access": cm.Access, "hashtags": cm.Hashtags,
		"current_user_role": role, "current_user_banned": banned,
	}})
}

// Create generic post: standalone or in a group/community/channel
func createGenericPost(c *fiber.Ctx, db *sqlx.DB) error {
	var body struct {
		Title        string   `json:"title"`
		Body         string   `json:"body"`
		Kind         string   `json:"kind"`
		Visibility   string   `json:"visibility"`
		CommunityID  *int64   `json:"community_id"`
		ChannelID    *int64   `json:"channel_id"`
		GroupID      *int64   `json:"group_id"`
		ParentPostID *int64   `json:"parent_post_id"`
		Hashtags     []string `json:"hashtags"`
		Media        []struct {
			URL  string `json:"url"`
			Kind string `json:"kind"`
		} `json:"media"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid json"})
	}
	if strings.TrimSpace(body.Title) == "" && strings.TrimSpace(body.Body) == "" && strings.ToLower(body.Kind) != "repost" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "title or body required"})
	}
	kind := strings.ToLower(strings.TrimSpace(body.Kind))
	if kind == "" {
		kind = "post"
	}
	vis := strings.ToLower(strings.TrimSpace(body.Visibility))
	if vis == "" {
		vis = "public"
	}
	if vis != "public" && vis != "private" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid visibility"})
	}

	// Visibility enforcement for private targets
	if body.CommunityID != nil {
        if isBannedFromCommunity(db, *body.CommunityID, userIDFromContext(c)) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "banned from this community"})
		}
		// New: always require membership for posting into a community (public or private)
        if !isMember(db, *body.CommunityID, userIDFromContext(c)) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "membership required"})
		}
		// Keep private visibility check for defense in depth
		if private, err := isCommunityPrivate(db, *body.CommunityID); err == nil && private {
            if !isMember(db, *body.CommunityID, userIDFromContext(c)) {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "membership required"})
			}
		}
	}
	if body.GroupID != nil {
        if isBannedFromGroup(db, *body.GroupID, userIDFromContext(c)) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "banned from this group"})
		}
		if private, err := isGroupPrivate(db, *body.GroupID); err == nil && private {
            if !isGroupMember(db, *body.GroupID, userIDFromContext(c)) {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "membership required"})
			}
		}
	}

	tx, err := db.Beginx()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
	}
	defer tx.Rollback()

	var id int64
	if kind == "story" {
		err = tx.QueryRowx("INSERT INTO posts (community_id, channel_id, group_id, user_id, title, body, kind, visibility, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now() + interval '24 hours') RETURNING id",
			body.CommunityID, body.ChannelID, body.GroupID, userIDFromContext(c), body.Title, body.Body, kind, vis,
		).Scan(&id)
	} else {
		err = tx.QueryRowx("INSERT INTO posts (community_id, channel_id, group_id, user_id, title, body, kind, visibility, parent_post_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
			body.CommunityID, body.ChannelID, body.GroupID, userIDFromContext(c), body.Title, body.Body, kind, vis, body.ParentPostID,
		).Scan(&id)
	}
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "create failed"})
	}

	// Tags
	for _, t := range body.Hashtags {
		t = strings.TrimSpace(strings.TrimPrefix(t, "#"))
		if t == "" {
			continue
		}
		var tagID int64
		if err := tx.QueryRowx("INSERT INTO tags(name) VALUES ($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id", t).Scan(&tagID); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "tag upsert failed"})
		}
		if _, err := tx.Exec("INSERT INTO post_tags(post_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", id, tagID); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "tag link failed"})
		}
	}

	// Media attachments
	for i, m := range body.Media {
		u := strings.TrimSpace(m.URL)
		if u == "" {
			continue
		}
		kind := strings.ToLower(strings.TrimSpace(m.Kind))
		if kind == "" {
			kind = "image"
		}
		if _, err := tx.Exec("INSERT INTO posts_media(post_id, url, kind, position) VALUES ($1,$2,$3,$4)", id, u, kind, i); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "media insert failed"})
		}
	}

	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "commit failed"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"success": true, "message": "created", "data": fiber.Map{"id": id}})
}

func publicFeed(c *fiber.Ctx, db *sqlx.DB) error {
	limit := 50
	if v := strings.TrimSpace(c.Query("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	q := `
      SELECT p.id, p.title, p.body, p.user_id, p.kind, p.created_at,
             p.community_id, c.slug as community_slug,
             p.group_id, g.slug as group_slug
      FROM posts p
      LEFT JOIN communities c ON c.id = p.community_id
      LEFT JOIN groups g ON g.id = p.group_id
      WHERE (p.expires_at IS NULL OR now() <= p.expires_at)
        AND p.visibility = 'public'
        AND (p.kind IN ('post','repost','quote','story'))
        AND (
              (p.community_id IS NULL AND p.group_id IS NULL)
           OR (p.community_id IS NOT NULL AND c.visibility = 'public')
           OR (p.group_id IS NOT NULL AND g.visibility = 'public')
        )
      ORDER BY p.id DESC
      LIMIT $1`
	rows, err := db.Queryx(q, limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
        var id sql.NullInt64
        var userID sql.NullString
        var title, body, kind sql.NullString
        var createdAt sql.NullString
        var communityID, groupID sql.NullInt64
        var communitySlug, groupSlug sql.NullString
        _ = rows.Scan(&id, &title, &body, &userID, &kind, &createdAt, &communityID, &communitySlug, &groupID, &groupSlug)
		// counts
		var likeCount, reactCount, viewCount, commentCount int64
		_ = db.Get(&likeCount, "SELECT COUNT(*) FROM post_likes WHERE post_id=$1", id.Int64)
		_ = db.Get(&reactCount, "SELECT COUNT(*) FROM post_reactions WHERE post_id=$1", id.Int64)
		_ = db.Get(&viewCount, "SELECT views FROM post_views_agg WHERE post_id=$1", id.Int64)
		_ = db.Get(&commentCount, "SELECT COUNT(*) FROM post_comments WHERE post_id=$1", id.Int64)
		// reactions breakdown
		rb := []map[string]any{}
		rrows, _ := db.Queryx("SELECT emoji, COUNT(*) FROM post_reactions WHERE post_id=$1 GROUP BY emoji ORDER BY COUNT(*) DESC", id.Int64)
		for rrows != nil && rrows.Next() {
			var emoji string
			var cnt int64
			_ = rrows.Scan(&emoji, &cnt)
			rb = append(rb, fiber.Map{"emoji": emoji, "count": cnt})
		}
		if rrows != nil {
			rrows.Close()
		}
		// media (first 6)
		media := []map[string]any{}
		mrows, _ := db.Queryx("SELECT url, kind FROM posts_media WHERE post_id=$1 ORDER BY position ASC, id ASC LIMIT 6", id.Int64)
		for mrows != nil && mrows.Next() {
			var url, mkind string
			_ = mrows.Scan(&url, &mkind)
			media = append(media, fiber.Map{"url": url, "kind": mkind})
		}
		if mrows != nil {
			mrows.Close()
		}
        items = append(items, fiber.Map{
            "id": id.Int64, "title": title.String, "body": body.String, "user_id": userID.String, "kind": kind.String, "created_at": createdAt.String,
            "community_id": communityID.Int64, "community_slug": communitySlug.String,
            "group_id": groupID.Int64, "group_slug": groupSlug.String,
            "like_count": likeCount, "reaction_count": reactCount, "view_count": viewCount, "comment_count": commentCount,
            "reactions": rb,
            "media":     media,
        })
	}
	return c.JSON(fiber.Map{"success": true, "message": "ok", "data": items})
}

func likePost(c *fiber.Ctx, db *sqlx.DB) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}
	if _, err := db.Exec("INSERT INTO post_likes(post_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", id, userIDFromContext(c)); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "like failed"})
	}
	var n int64
	_ = db.Get(&n, "SELECT COUNT(*) FROM post_likes WHERE post_id=$1", id)
	return c.JSON(fiber.Map{"success": true, "message": "liked", "data": fiber.Map{"like_count": n}})
}

func unlikePost(c *fiber.Ctx, db *sqlx.DB) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}
	if _, err := db.Exec("DELETE FROM post_likes WHERE post_id=$1 AND user_id=$2", id, userIDFromContext(c)); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "unlike failed"})
	}
	var n int64
	_ = db.Get(&n, "SELECT COUNT(*) FROM post_likes WHERE post_id=$1", id)
	return c.JSON(fiber.Map{"success": true, "message": "unliked", "data": fiber.Map{"like_count": n}})
}

func reactPost(c *fiber.Ctx, db *sqlx.DB) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}
	var body struct {
		Emoji string `json:"emoji"`
	}
	if err := c.BodyParser(&body); err != nil || strings.TrimSpace(body.Emoji) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "emoji required"})
	}
	if _, err := db.Exec("INSERT INTO post_reactions(post_id, user_id, emoji) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", id, userIDFromContext(c), body.Emoji); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "react failed"})
	}
	var n int64
	_ = db.Get(&n, "SELECT COUNT(*) FROM post_reactions WHERE post_id=$1", id)
	return c.JSON(fiber.Map{"success": true, "message": "reacted", "data": fiber.Map{"reaction_count": n}})
}

func unreactPost(c *fiber.Ctx, db *sqlx.DB) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}
	emoji := strings.TrimSpace(c.Query("emoji"))
	if emoji == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "emoji required"})
	}
	if _, err := db.Exec("DELETE FROM post_reactions WHERE post_id=$1 AND user_id=$2 AND emoji=$3", id, userIDFromContext(c), emoji); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "unreact failed"})
	}
	var n int64
	_ = db.Get(&n, "SELECT COUNT(*) FROM post_reactions WHERE post_id=$1", id)
	return c.JSON(fiber.Map{"success": true, "message": "unreacted", "data": fiber.Map{"reaction_count": n}})
}

func viewPost(c *fiber.Ctx, db *sqlx.DB) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}
	if _, err := db.Exec("INSERT INTO post_views_agg(post_id, views, updated_at) VALUES ($1,1,now()) ON CONFLICT (post_id) DO UPDATE SET views=post_views_agg.views+1, updated_at=now()", id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "view failed"})
	}
	var n int64
	_ = db.Get(&n, "SELECT views FROM post_views_agg WHERE post_id=$1", id)
	return c.JSON(fiber.Map{"success": true, "message": "viewed", "data": fiber.Map{"view_count": n}})
}

func listComments(c *fiber.Ctx, db *sqlx.DB) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}
	rows, err := db.Queryx("SELECT id, user_id, body, parent_comment_id, created_at FROM post_comments WHERE post_id=$1 ORDER BY id ASC LIMIT 500", id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
        var cid int64
        var uid string
        var body, created string
        var parent sql.NullInt64
        _ = rows.Scan(&cid, &uid, &body, &parent, &created)
        items = append(items, fiber.Map{"id": cid, "user_id": uid, "body": body, "parent_comment_id": parent.Int64, "created_at": created})
	}
	return c.JSON(fiber.Map{"success": true, "message": "ok", "data": items})
}

func createComment(c *fiber.Ctx, db *sqlx.DB) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}
	var body struct {
		Body            string `json:"body"`
		ParentCommentID *int64 `json:"parent_comment_id"`
	}
	if err := c.BodyParser(&body); err != nil || strings.TrimSpace(body.Body) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "body required"})
	}
	var cid int64
	if err := db.QueryRowx("INSERT INTO post_comments(post_id, user_id, body, parent_comment_id) VALUES ($1,$2,$3,$4) RETURNING id", id, userIDFromContext(c), body.Body, body.ParentCommentID).Scan(&cid); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "create failed"})
	}
	var cnt int64
	_ = db.Get(&cnt, "SELECT COUNT(*) FROM post_comments WHERE post_id=$1", id)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"success": true, "message": "created", "data": fiber.Map{"id": cid, "comment_count": cnt}})
}

func uploadHandler(publicBase string) fiber.Handler {
	prefix := strings.TrimRight(publicBase, "/")
	if prefix == "" {
		prefix = "/uploads"
	}
	return func(c *fiber.Ctx) error {
		f, err := c.FormFile("file")
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "file required"})
		}
		name := f.Filename
		ext := strings.ToLower(filepath.Ext(name))
		kind := "image"
		if ext == ".mp4" || ext == ".webm" || ext == ".mov" {
			kind = "video"
		}
		base := strconv.FormatInt(time.Now().UnixNano(), 10)
		dst := filepath.Join("/data/uploads", base+ext)
		if err := c.SaveFile(f, dst); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "save failed"})
		}
		url := prefix + "/" + filepath.Base(dst)
		return c.JSON(fiber.Map{"success": true, "message": "uploaded", "data": fiber.Map{"url": url, "kind": kind}})
	}
}

func exploreByTag(c *fiber.Ctx, db *sqlx.DB) error {
	tag := strings.TrimSpace(c.Query("tag"))
	if tag == "" {
		return c.JSON(fiber.Map{"success": true, "message": "ok", "data": []any{}})
	}
	q := `
      SELECT p.id, p.title, p.body, p.user_id, p.kind, p.created_at
      FROM post_tags pt
      JOIN tags t ON t.id = pt.tag_id
      JOIN posts p ON p.id = pt.post_id
      LEFT JOIN communities c ON c.id = p.community_id
      LEFT JOIN groups g ON g.id = p.group_id
      WHERE LOWER(t.name) = LOWER($1)
        AND (p.expires_at IS NULL OR now() <= p.expires_at)
        AND p.visibility = 'public'
        AND (
              (p.community_id IS NULL AND p.group_id IS NULL)
           OR (p.community_id IS NOT NULL AND c.visibility = 'public')
           OR (p.group_id IS NOT NULL AND g.visibility = 'public')
        )
      ORDER BY p.id DESC
      LIMIT 200`
	posts := []map[string]any{}
	rows, err := db.Queryx(q, strings.TrimPrefix(tag, "#"))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
	}
	defer rows.Close()
    for rows.Next() {
        var id sql.NullInt64
        var userID sql.NullString
        var title, body, kind sql.NullString
        var createdAt sql.NullString
        _ = rows.Scan(&id, &title, &body, &userID, &kind, &createdAt)
        posts = append(posts, fiber.Map{"id": id.Int64, "title": title.String, "body": body.String, "user_id": userID.String, "kind": kind.String})
    }
	return c.JSON(fiber.Map{"success": true, "message": "ok", "data": posts})
}

func usersMiniProxy(c *fiber.Ctx, coreAPIBase string) error {
	ids := strings.TrimSpace(c.Query("ids"))
	if ids == "" {
		return c.JSON(fiber.Map{"success": true, "message": "ok", "data": []any{}})
	}
	req, err := http.NewRequest("GET", strings.TrimRight(coreAPIBase, "/")+"/v1/users/mini?ids="+urlQueryEscape(ids), nil)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "proxy error"})
	}
	if authz := c.Get("Authorization"); authz != "" {
		req.Header.Set("Authorization", authz)
	}
	if cookie := c.Get("Cookie"); cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"success": false, "message": "core unavailable"})
	}
	defer resp.Body.Close()
	c.Set("Content-Type", resp.Header.Get("Content-Type"))
	c.Status(resp.StatusCode)
	_, _ = io.Copy(c, resp.Body)
	return nil
}

func urlQueryEscape(s string) string {
	r := strings.ReplaceAll(s, " ", "+")
	r = strings.ReplaceAll(r, "\n", "")
	return r
}

// Stories feed for the current user: first own stories, then others' recent stories.
func storiesFeed(c *fiber.Ctx, db *sqlx.DB) error {
    uid := userIDFromContext(c)
    if strings.TrimSpace(uid) == "" {
        return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "message": "login required"})
    }
    // Own stories (latest 10)
    own := []map[string]any{}
    rows, err := db.Queryx(`
        SELECT p.id, p.created_at
        FROM posts p
        WHERE p.kind='story' AND p.user_id=$1 AND (p.expires_at IS NULL OR now() <= p.expires_at)
        ORDER BY p.id DESC
        LIMIT 10
    `, uid)
    if err != nil {
        return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
    }
    for rows.Next() {
        var id int64
        var created string
        _ = rows.Scan(&id, &created)
        media := []map[string]any{}
        mrows, _ := db.Queryx("SELECT url, kind FROM posts_media WHERE post_id=$1 ORDER BY position ASC, id ASC LIMIT 6", id)
        for mrows != nil && mrows.Next() {
            var url, mkind string
            _ = mrows.Scan(&url, &mkind)
            media = append(media, fiber.Map{"url": url, "kind": mkind})
        }
        if mrows != nil { mrows.Close() }
        own = append(own, fiber.Map{"post_id": id, "created_at": created, "user_id": uid, "media": media})
    }
    rows.Close()

    // Others' most recent story per user (last 50 users)
    others := []map[string]any{}
    orows, err := db.Queryx(`
        SELECT DISTINCT ON (p.user_id) p.user_id, p.id, p.created_at
        FROM posts p
        WHERE p.kind='story' AND (p.expires_at IS NULL OR now() <= p.expires_at) AND p.user_id <> $1
        ORDER BY p.user_id, p.id DESC
        LIMIT 50
    `, uid)
    if err != nil {
        return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
    }
    for orows.Next() {
        var postID int64
        var created string
        var authorID string
        _ = orows.Scan(&authorID, &postID, &created)
        media := []map[string]any{}
        mrows, _ := db.Queryx("SELECT url, kind FROM posts_media WHERE post_id=$1 ORDER BY position ASC, id ASC LIMIT 3", postID)
        for mrows != nil && mrows.Next() {
            var url, mkind string
            _ = mrows.Scan(&url, &mkind)
            media = append(media, fiber.Map{"url": url, "kind": mkind})
        }
        if mrows != nil { mrows.Close() }
        others = append(others, fiber.Map{"post_id": postID, "created_at": created, "user_id": authorID, "media": media})
    }
    orows.Close()

    return c.JSON(fiber.Map{"success": true, "message": "ok", "data": fiber.Map{"own": own, "others": others}})
}

func listGroups(c *fiber.Ctx, db *sqlx.DB) error {
	groups := []Group{}
	if err := db.Select(&groups, "SELECT id, name, slug, description, visibility FROM groups ORDER BY id DESC LIMIT 200"); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
	}
	return c.JSON(fiber.Map{"success": true, "message": "ok", "data": groups})
}

func createGroup(c *fiber.Ctx, db *sqlx.DB) error {
	var req Group
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid json"})
	}
	if strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.Slug) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "name and slug required"})
	}
	if req.Visibility == "" {
		req.Visibility = "public"
	}
	tx, err := db.Beginx()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
	}
	defer tx.Rollback()
	if err := tx.QueryRowx("INSERT INTO groups(name, slug, description, visibility) VALUES ($1,$2,$3,$4) RETURNING id", req.Name, req.Slug, req.Description, req.Visibility).Scan(&req.ID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "create failed"})
	}
	// creator becomes owner
    if uid := userIDFromContext(c); uid != "" {
		if _, err := tx.Exec("INSERT INTO group_members(group_id, user_id, role) VALUES ($1,$2,'owner') ON CONFLICT DO NOTHING", req.ID, uid); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "owner assign failed"})
		}
		if _, err := tx.Exec("INSERT INTO group_owners(group_id, user_id, started_at) VALUES ($1,$2, now())", req.ID, uid); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "owner history failed"})
		}
	}
	if err := tx.Commit(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "commit failed"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"success": true, "message": "created", "data": req})
}

func getGroup(c *fiber.Ctx, db *sqlx.DB) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}
	var g Group
	if err := db.Get(&g, "SELECT id, name, slug, description, visibility FROM groups WHERE id=$1", id); err != nil {
		if err == sql.ErrNoRows {
			return c.SendStatus(fiber.StatusNotFound)
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
	}
	return c.JSON(fiber.Map{"success": true, "message": "ok", "data": g})
}

func getGroupBySlug(c *fiber.Ctx, db *sqlx.DB) error {
	slug := strings.TrimSpace(c.Params("slug"))
	if slug == "" {
		return c.SendStatus(fiber.StatusNotFound)
	}
	var g Group
	if err := db.Get(&g, "SELECT id, name, slug, description, visibility FROM groups WHERE slug=$1", slug); err != nil {
		if err == sql.ErrNoRows {
			return c.SendStatus(fiber.StatusNotFound)
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
	}
	var role string
	_ = db.Get(&role, "SELECT role FROM group_members WHERE group_id=$1 AND user_id=$2", g.ID, userIDFromContext(c))
	banned := false
	// if group_bans table exists, check ban; ignore error if not
	if db != nil {
		banned = isBannedFromGroup(db, g.ID, userIDFromContext(c))
	}
	return c.JSON(fiber.Map{"success": true, "message": "ok", "data": fiber.Map{
		"id": g.ID, "name": g.Name, "slug": g.Slug, "description": g.Description, "visibility": g.Visibility,
		"current_user_role": role, "current_user_banned": banned,
	}})
}

func joinGroup(c *fiber.Ctx, db *sqlx.DB) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}
	if isBannedFromGroup(db, id, userIDFromContext(c)) {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "banned from this group"})
	}
	var vis string
	if err := db.Get(&vis, "SELECT visibility FROM groups WHERE id=$1", id); err != nil {
		if err == sql.ErrNoRows {
			return c.SendStatus(fiber.StatusNotFound)
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
	}
	if strings.ToLower(vis) == "private" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "invite required for private group"})
	}
	if _, err := db.Exec("INSERT INTO group_members(group_id, user_id, role) VALUES ($1,$2,'member') ON CONFLICT DO NOTHING", id, userIDFromContext(c)); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "join failed"})
	}
	return c.JSON(fiber.Map{"success": true, "message": "joined"})
}

func isGroupPrivate(db *sqlx.DB, groupID int64) (bool, error) {
	var vis string
	if err := db.Get(&vis, "SELECT visibility FROM groups WHERE id=$1", groupID); err != nil {
		return false, err
	}
	return strings.ToLower(vis) == "private", nil
}

func isGroupMember(db *sqlx.DB, groupID int64, userID string) bool {
    if strings.TrimSpace(userID) == "" {
        return false
    }
    var exists bool
    _ = db.Get(&exists, "SELECT EXISTS (SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2)", groupID, userID)
    return exists
}

// Group bans and admin actions
func isBannedFromGroup(db *sqlx.DB, groupID int64, userID string) bool {
    if strings.TrimSpace(userID) == "" {
        return false
    }
    var exists bool
    _ = db.Get(&exists, "SELECT EXISTS (SELECT 1 FROM group_bans WHERE group_id=$1 AND user_id=$2)", groupID, userID)
    return exists
}

func setGroupMemberRole(c *fiber.Ctx, db *sqlx.DB) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}
    targetUserID := strings.TrimSpace(c.Params("userId"))
    if _, err := uuid.Parse(targetUserID); err != nil { return c.SendStatus(fiber.StatusNotFound) }
	var body struct {
		Role string `json:"role"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid json"})
	}
	role := strings.ToLower(strings.TrimSpace(body.Role))
	if role != "admin" && role != "mod" && role != "member" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid role"})
	}
	var actorRole string
	_ = db.Get(&actorRole, "SELECT role FROM group_members WHERE group_id=$1 AND user_id=$2", id, userIDFromContext(c))
	if actorRole != "owner" && actorRole != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "forbidden"})
	}
	var targetRole string
	_ = db.Get(&targetRole, "SELECT role FROM group_members WHERE group_id=$1 AND user_id=$2", id, targetUserID)
	if targetRole == "owner" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "cannot change owner via this endpoint"})
	}
	if _, err := db.Exec("UPDATE group_members SET role=$1 WHERE group_id=$2 AND user_id=$3", role, id, targetUserID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "update failed"})
	}
	return c.JSON(fiber.Map{"success": true, "message": "role updated"})
}

func groupBanAction(c *fiber.Ctx, db *sqlx.DB) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}
    targetUserID := strings.TrimSpace(c.Params("userId"))
    if _, err := uuid.Parse(targetUserID); err != nil { return c.SendStatus(fiber.StatusNotFound) }
	var body struct {
		Action string `json:"action"`
		Reason string `json:"reason"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid json"})
	}
	action := strings.ToLower(strings.TrimSpace(body.Action))
	if action != "ban" && action != "unban" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid action"})
	}
	var actorRole string
	_ = db.Get(&actorRole, "SELECT role FROM group_members WHERE group_id=$1 AND user_id=$2", id, userIDFromContext(c))
	if actorRole != "owner" && actorRole != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "forbidden"})
	}
	if action == "ban" {
		if _, err := db.Exec("INSERT INTO group_bans(group_id, user_id, reason) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", id, targetUserID, strings.TrimSpace(body.Reason)); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "ban failed"})
		}
		return c.JSON(fiber.Map{"success": true, "message": "banned"})
	}
	if _, err := db.Exec("DELETE FROM group_bans WHERE group_id=$1 AND user_id=$2", id, targetUserID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "unban failed"})
	}
	return c.JSON(fiber.Map{"success": true, "message": "unbanned"})
}

func updateCommunity(c *fiber.Ctx, db *sqlx.DB) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}
	// Only owner can update
	var role string
	_ = db.Get(&role, "SELECT role FROM community_members WHERE community_id=$1 AND user_id=$2", id, userIDFromContext(c))
	if role != "owner" && role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "forbidden"})
	}
	var body Community
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid json"})
	}
	if body.Name == "" && body.Description == "" && body.Visibility == "" && body.Access == "" {
		return c.JSON(fiber.Map{"success": true, "message": "no changes"})
	}
	// Build partial update
	sets := []string{}
	args := []any{}
	idx := 1
	if body.Name != "" {
		sets = append(sets, "name=$"+strconv.Itoa(idx))
		args = append(args, body.Name)
		idx++
	}
	if body.Description != "" {
		sets = append(sets, "description=$"+strconv.Itoa(idx))
		args = append(args, body.Description)
		idx++
	}
	if body.Visibility != "" {
		sets = append(sets, "visibility=$"+strconv.Itoa(idx))
		args = append(args, body.Visibility)
		idx++
	}
	if body.Access != "" {
		sets = append(sets, "access=$"+strconv.Itoa(idx))
		args = append(args, body.Access)
		idx++
	}
	args = append(args, id)
	if len(sets) > 0 {
		_, err := db.Exec("UPDATE communities SET "+strings.Join(sets, ",")+" WHERE id=$"+strconv.Itoa(idx), args...)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "update failed"})
		}
	}
	return getCommunity(c, db)
}

func deleteCommunity(c *fiber.Ctx, db *sqlx.DB) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}
	var role string
	_ = db.Get(&role, "SELECT role FROM community_members WHERE community_id=$1 AND user_id=$2", id, userIDFromContext(c))
	if role != "owner" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "forbidden"})
	}
	if _, err := db.Exec("DELETE FROM communities WHERE id=$1", id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "delete failed"})
	}
	return c.JSON(fiber.Map{"success": true, "message": "deleted"})
}

func listChannels(c *fiber.Ctx, db *sqlx.DB) error {
	communityID, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}
	// Access: if community private, require membership
	if private, err := isCommunityPrivate(db, communityID); err == nil && private {
		if !isMember(db, communityID, userIDFromContext(c)) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "private community"})
		}
	}
	type Channel struct {
		ID   int64  `db:"id" json:"id"`
		Name string `db:"name" json:"name"`
		Slug string `db:"slug" json:"slug"`
	}
	channels := []Channel{}
	if err := db.Select(&channels, "SELECT id, name, slug FROM channels WHERE community_id=$1 ORDER BY id", communityID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
	}
	return c.JSON(fiber.Map{"success": true, "message": "ok", "data": channels})
}

func createChannel(c *fiber.Ctx, db *sqlx.DB) error {
	communityID, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}
	if !isMember(db, communityID, userIDFromContext(c)) {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "membership required"})
	}
	var body struct{ Name, Slug string }
	if err := c.BodyParser(&body); err != nil || strings.TrimSpace(body.Name) == "" || strings.TrimSpace(body.Slug) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "name and slug required"})
	}
	var id int64
	if err := db.QueryRowx("INSERT INTO channels (community_id, name, slug) VALUES ($1,$2,$3) RETURNING id", communityID, body.Name, body.Slug).Scan(&id); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "create failed"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"success": true, "message": "created", "data": fiber.Map{"id": id, "name": body.Name, "slug": body.Slug}})
}

func getChannel(c *fiber.Ctx, db *sqlx.DB) error {
	channelID, err := strconv.ParseInt(c.Params("channelId"), 10, 64)
	if err != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}
	var ch struct {
		ID          int64  `db:"id" json:"id"`
		CommunityID int64  `db:"community_id" json:"community_id"`
		Name        string `db:"name" json:"name"`
		Slug        string `db:"slug" json:"slug"`
	}
	if err := db.Get(&ch, "SELECT id, community_id, name, slug FROM channels WHERE id=$1", channelID); err != nil {
		if err == sql.ErrNoRows {
			return c.SendStatus(fiber.StatusNotFound)
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
	}
	if private, err := isCommunityPrivate(db, ch.CommunityID); err == nil && private {
		if !isMember(db, ch.CommunityID, userIDFromContext(c)) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "private community"})
		}
	}
	return c.JSON(fiber.Map{"success": true, "message": "ok", "data": ch})
}

func listPosts(c *fiber.Ctx, db *sqlx.DB) error {
	channelID, err := strconv.ParseInt(c.Params("channelId"), 10, 64)
	if err != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}
	var communityID int64
	if err := db.Get(&communityID, "SELECT community_id FROM channels WHERE id=$1", channelID); err != nil {
		if err == sql.ErrNoRows {
			return c.SendStatus(fiber.StatusNotFound)
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
	}
	if private, err := isCommunityPrivate(db, communityID); err == nil && private {
		if !isMember(db, communityID, userIDFromContext(c)) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "private community"})
		}
	}
    type Post struct {
        ID        int64  `db:"id" json:"id"`
        Title     string `db:"title" json:"title"`
        Body      string `db:"body" json:"body"`
        UserID    string `db:"user_id" json:"user_id"`
        CreatedAt string `db:"created_at" json:"created_at"`
    }
    posts := []Post{}
    if err := db.Select(&posts, "SELECT id, title, body, user_id, created_at FROM posts WHERE channel_id=$1 AND (expires_at IS NULL OR now() <= expires_at) ORDER BY id DESC LIMIT 200", channelID); err != nil {
        return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
    }
	return c.JSON(fiber.Map{"success": true, "message": "ok", "data": posts})
}

func createPost(c *fiber.Ctx, db *sqlx.DB) error {
	channelID, err := strconv.ParseInt(c.Params("channelId"), 10, 64)
	if err != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}
	var communityID int64
	if err := db.Get(&communityID, "SELECT community_id FROM channels WHERE id=$1", channelID); err != nil {
		if err == sql.ErrNoRows {
			return c.SendStatus(fiber.StatusNotFound)
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
	}
	if isBannedFromCommunity(db, communityID, userIDFromContext(c)) {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "banned from this community"})
	}
	if !isMember(db, communityID, userIDFromContext(c)) {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "membership required"})
	}
	var body struct{ Title, Body string }
	if err := c.BodyParser(&body); err != nil || strings.TrimSpace(body.Title) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "title required"})
	}
	var id int64
	if err := db.QueryRowx("INSERT INTO posts (community_id, channel_id, user_id, title, body) VALUES ($1,$2,$3,$4,$5) RETURNING id", communityID, channelID, userIDFromContext(c), body.Title, body.Body).Scan(&id); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "create failed"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"success": true, "message": "created", "data": fiber.Map{"id": id}})
}

func isCommunityPrivate(db *sqlx.DB, communityID int64) (bool, error) {
	var vis string
	if err := db.Get(&vis, "SELECT visibility FROM communities WHERE id=$1", communityID); err != nil {
		return false, err
	}
	return strings.ToLower(vis) == "private", nil
}

func isMember(db *sqlx.DB, communityID int64, userID string) bool {
    if strings.TrimSpace(userID) == "" {
        return false
    }
    var exists bool
    _ = db.Get(&exists, "SELECT EXISTS (SELECT 1 FROM community_members WHERE community_id=$1 AND user_id=$2)", communityID, userID)
    return exists
}

func tagsSuggest(c *fiber.Ctx, db *sqlx.DB) error {
	q := strings.TrimSpace(c.Query("q"))
	if q == "" {
		return c.JSON(fiber.Map{"success": true, "message": "ok", "data": []any{}})
	}
	limit := 10
	if v := strings.TrimSpace(c.Query("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 50 {
			limit = n
		}
	}
	rows, err := db.Queryx(`
      SELECT t.name, COUNT(pt.post_id) AS usage
      FROM tags t
      LEFT JOIN post_tags pt ON pt.tag_id = t.id
      WHERE LOWER(t.name) LIKE LOWER($1 || '%')
      GROUP BY t.id
      ORDER BY usage DESC, t.name ASC
      LIMIT $2
    `, q, limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "db error"})
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var name string
		var usage int64
		_ = rows.Scan(&name, &usage)
		items = append(items, fiber.Map{"name": name, "count": usage})
	}
	return c.JSON(fiber.Map{"success": true, "message": "ok", "data": items})
}

func isBannedFromCommunity(db *sqlx.DB, communityID int64, userID string) bool {
    if strings.TrimSpace(userID) == "" {
        return false
    }
    var exists bool
    _ = db.Get(&exists, "SELECT EXISTS (SELECT 1 FROM community_bans WHERE community_id=$1 AND user_id=$2)", communityID, userID)
    return exists
}

func setCommunityMemberRole(c *fiber.Ctx, db *sqlx.DB) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}
    targetUserID := strings.TrimSpace(c.Params("userId"))
    if _, err := uuid.Parse(targetUserID); err != nil { return c.SendStatus(fiber.StatusNotFound) }
	var body struct {
		Role string `json:"role"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid json"})
	}
	role := strings.ToLower(strings.TrimSpace(body.Role))
	if role != "admin" && role != "member" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid role"})
	}
	// Permission: only owner or admin can modify roles
	var actorRole string
	_ = db.Get(&actorRole, "SELECT role FROM community_members WHERE community_id=$1 AND user_id=$2", id, userIDFromContext(c))
	if actorRole != "owner" && actorRole != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "forbidden"})
	}
	// Prevent demoting owner via this endpoint
	var targetRole string
	_ = db.Get(&targetRole, "SELECT role FROM community_members WHERE community_id=$1 AND user_id=$2", id, targetUserID)
	if targetRole == "owner" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "cannot change owner via this endpoint"})
	}
	if _, err := db.Exec("UPDATE community_members SET role=$1 WHERE community_id=$2 AND user_id=$3", role, id, targetUserID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "update failed"})
	}
	return c.JSON(fiber.Map{"success": true, "message": "role updated"})
}

func communityBanAction(c *fiber.Ctx, db *sqlx.DB) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}
    targetUserID := strings.TrimSpace(c.Params("userId"))
    if _, err := uuid.Parse(targetUserID); err != nil { return c.SendStatus(fiber.StatusNotFound) }
	var body struct {
		Action string `json:"action"`
		Reason string `json:"reason"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid json"})
	}
	action := strings.ToLower(strings.TrimSpace(body.Action))
	if action != "ban" && action != "unban" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "message": "invalid action"})
	}
	// Permission: only owner/admin can ban
	var actorRole string
	_ = db.Get(&actorRole, "SELECT role FROM community_members WHERE community_id=$1 AND user_id=$2", id, userIDFromContext(c))
	if actorRole != "owner" && actorRole != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "forbidden"})
	}
	if action == "ban" {
		if _, err := db.Exec("INSERT INTO community_bans(community_id, user_id, reason) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", id, targetUserID, strings.TrimSpace(body.Reason)); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "ban failed"})
		}
		return c.JSON(fiber.Map{"success": true, "message": "banned"})
	}
	if _, err := db.Exec("DELETE FROM community_bans WHERE community_id=$1 AND user_id=$2", id, targetUserID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "message": "unban failed"})
	}
	return c.JSON(fiber.Map{"success": true, "message": "unbanned"})
}
