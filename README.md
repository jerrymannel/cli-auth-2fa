# cli-auth-2fa

A terminal-based 2FA (TOTP) authenticator. Search your accounts, generate tokens, and copy them to clipboard — all from the CLI.

## Download

Pre-built executables are available on the [Releases](https://github.com/jerrymannel/cli-auth-2fa/releases) page. No Node.js required.

Download the binary for your platform, make it executable, and run it:

```bash
chmod +x cli-auth-2fa-macos
./cli-auth-2fa-macos
```

## Running from Source

**Requirements:** Node.js

```bash
git clone https://github.com/jerrymannel/cli-auth-2fa.git
cd cli-auth-2fa
npm install
node app.js
```

## Usage

When launched, you'll see a searchable list of your 2FA accounts.

### Navigation

| Key | Action |
|-----|--------|
| Type | Filter accounts by issuer or name |
| `↑` / `↓` | Move selection |
| `Enter` | Generate token and copy to clipboard |
| `Esc` | Toggle between Search and Command mode |
| `Ctrl+C` | Quit |

### Command Mode

Press `Esc` to enter Command Mode, then use these shortcuts:

| Key | Command |
|-----|---------|
| `a` | Add a new 2FA account |
| `r` | Remove account(s) |
| `e` | Export accounts as QR code PNG(s) |
| `i` | Import accounts from a QR code PNG |
| `q` | Quit |

### Adding an Account

In Command Mode, press `a` and paste an `otpauth://` URL. These URLs are typically shown as QR codes when setting up 2FA — use your authenticator app's export feature or scan the QR code with another tool to get the URL.

### Exporting / Importing

- **Export:** generates QR code PNG files (up to 15 entries per file) in the current directory.
- **Import:** reads a QR code PNG exported by this app and merges the entries, skipping duplicates.

## Data Storage

Accounts are stored in `db.json` next to the executable (or script). The file contains raw `otpauth://` URLs — keep it secure.
