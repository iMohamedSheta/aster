// aster-server is the headless workspace server. It runs the exact same
// replication protocol as LAN hosting inside the desktop app, which is what
// makes cloud sync a deployment choice rather than a separate product.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"aster/internal/api"
	"aster/internal/config"
	"aster/internal/store"
	"aster/internal/version"
)

func main() {
	home := flag.String("home", config.DataDir(), "data folder")
	dbPath := flag.String("db", "", "database path (defaults to <home>/aster.db)")
	addr := flag.String("addr", ":47821", "listen address")
	signup := flag.Bool("signup", false, "allow self-service workspace creation")
	tlsOn := flag.Bool("tls", false, "serve HTTPS with a self-signed certificate")
	showVersion := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Println(version.Version)
		return
	}
	if *dbPath == "" {
		*dbPath = config.DBPath(*home)
	}
	st, err := store.Open(*dbPath)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer st.Close()

	srv, err := api.New(api.Options{
		Store: st, Address: *addr, DataDir: *home, Version: version.Version,
		AllowSignup: *signup, TLS: *tlsOn,
	})
	if err != nil {
		log.Fatalf("create server: %v", err)
	}
	if err := srv.Start(); err != nil {
		log.Fatalf("start server: %v", err)
	}
	log.Printf("Aster workspace server %s", version.Version)
	log.Printf("database: %s", *dbPath)
	for _, u := range srv.URLs() {
		log.Printf("listening: %s", u)
	}
	if *signup {
		log.Printf("self-service workspace creation is enabled")
	}
	names := st.WorkspaceNames()
	log.Printf("workspaces: %d %v", len(names), names)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	_ = srv.Stop(ctx)
	log.Printf("stopped")
}
