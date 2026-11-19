package main

import (
	"embed"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"

	"aster/internal/config"
	"aster/internal/store"
	"aster/internal/version"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	route := flag.String("route", "", "initial route, used for screenshots")
	locale := flag.String("locale", "", "interface language: en or ar")
	autoLogin := flag.Bool("auto-login", false, "skip the sign-in screen and open as the clinic manager")
	showVersion := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Println(version.Version)
		return
	}
	if *route != "" {
		_ = os.Setenv("ASTER_START_ROUTE", *route)
	}

	dir := config.DataDir()
	cfg, err := config.Load(dir)
	if err != nil {
		log.Fatalf("load device settings: %v", err)
	}
	if *locale == "ar" || *locale == "en" {
		cfg.Locale = *locale
		_ = cfg.Save()
	}
	st, err := store.Open(config.DBPath(dir))
	if err != nil {
		log.Fatalf("open clinic database: %v", err)
	}
	app := NewApp(cfg, cfg.Path(), dir, st)
	if *autoLogin && cfg.Onboarded {
		if _, err := app.signInUnchecked(""); err != nil {
			log.Printf("auto sign-in: %v", err)
		}
	}

	err = wails.Run(&options.App{
		Title:                    "Aster — Clinic workspace",
		Width:                    1440,
		Height:                   920,
		MinWidth:                 1060,
		MinHeight:                660,
		Frameless:                true,
		DisableResize:            false,
		BackgroundColour:         &options.RGBA{R: 242, G: 238, B: 230, A: 1},
		AssetServer:              &assetserver.Options{Assets: assets},
		OnStartup:                app.startup,
		OnShutdown:               app.shutdown,
		Bind:                     []any{app},
		EnableDefaultContextMenu: true,
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			DisableWindowIcon:    false,
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}
