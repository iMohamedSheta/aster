package updater

// InstallInput describes a verified, downloaded update ready to apply.
type InstallInput struct {
	Platform       Platform
	DataDir        string
	Manifest       *Manifest
	Asset          *Asset
	Archive        string
	CurrentVersion string
	TargetVersion  string
}
