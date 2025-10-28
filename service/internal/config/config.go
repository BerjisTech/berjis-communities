package config

import "os"

type Config struct {
	AppName           string
	Env               string
	Port              string
	DatabaseURL       string
	CoreAPIBase       string
	AllowedOrigins    string
	UploadsPublicBase string
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func Load() Config {
	return Config{
		AppName:           getenv("APP_NAME", "berjis-communities"),
		Env:               getenv("APP_ENV", "development"),
		Port:              getenv("PORT", "8088"),
		DatabaseURL:       getenv("DATABASE_URL", "postgres://postgres:postgres@localhost:5441/berjis_communities?sslmode=disable"),
		CoreAPIBase:       getenv("CORE_API_BASE", "http://localhost:8080"),
		AllowedOrigins:    getenv("ALLOWED_ORIGINS", "*"),
		UploadsPublicBase: getenv("UPLOADS_PUBLIC_BASE", "/uploads"),
	}
}
