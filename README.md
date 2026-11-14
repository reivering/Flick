# Flick

Share a file between your phone and computer from a browser. No account or app installation required.

Choose **Receive** on one device, then scan its QR code or enter its eight-digit code on the other device. Select a file and tap **Flick to send**, or swipe upward on its preview. The receiving device can view supported images and download the original file.

## Features

- Share one file at a time, smaller than 1 GB
- Pair with a QR code or an eight-digit code
- Preview JPEG, PNG, GIF, and WebP images and download files unchanged
- Reopen received files from the file icon in the same browser, until they expire
- Automatically expire files 24 hours after upload

## Getting started

You need [Node.js](https://nodejs.org/) 22.13 or newer and npm.

```sh
git clone https://github.com/reivering/Flick.git
cd Flick
npm ci
npm start
```

Open **http://localhost:3000** on the computer running Flick. To connect a second device on the same network, open the server's network address on **both** devices, for example `http://192.168.1.10:3000`. Replace the example IP with your computer's address. A QR code generated at `localhost` will not work on another device because `localhost` refers to that device itself.

For access beyond your local network, host Flick at a reachable HTTPS address on a server with persistent storage. Both devices must open that same address.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Listening port |
| `FLICK_DATA_DIR` | `./data` | Directory for the database and uploaded files |

For example:

```sh
PORT=4317 FLICK_DATA_DIR=/path/to/flick-data npm start
```

The server binds to all network interfaces. Protect the data directory from other users and ensure the host has enough disk space for uploads.

## How storage and expiry work

Files are stored unchanged in the data directory; their metadata and connection sessions are held in SQLite. Access expires 24 hours after upload. While the server is running, it checks for expired files once a minute and removes the stored file and its database record. It also checks at startup, so if the server was offline at expiry, physical deletion happens after it restarts. Any backups need their own deletion policy. Downloaded copies remain on the recipient's device.

Received-file history is tied to session cookies in the receiving browser. Clearing those cookies or changing browsers removes access to that history. Files received on other devices do not appear there.

Flick currently runs as a **single server with a persistent disk**; serverless deployments and multiple replicas are not supported. Transfers go through the server and require enough storage for each file. HTTPS protects traffic in transit when properly configured; local HTTP does not. Anyone with a valid pairing code can connect to the corresponding session. The project has not undergone a professional security audit, and the built-in limits are not a complete defense against public abuse. Review the deployment and security requirements before exposing an instance to untrusted users.

## Development

```sh
npm test
```

The tests cover pairing, file transfer, access restrictions, received-file history, and expiry. The interface is plain HTML, CSS, and JavaScript; the server uses Express, Multer, SQLite, and a QR-code generator. See [DESIGN.md](DESIGN.md) for the product's design direction.

Issues and pull requests are welcome. Please describe the problem or change, include steps to reproduce bugs, and run the tests before submitting a pull request. Never include real private files, session codes, or credentials in a report.

## License and credits

Flick is licensed under the [MIT License](LICENSE). Dependencies have their own licenses.

The optional project-local [Unslop skill](.agents/skills/unslop/SKILL.md), created by [Damir Sokolovsky](https://github.com/heydamir), is separately licensed under [CC BY 4.0](.agents/skills/unslop/LICENSE). Its source is [heydamir/unslop](https://github.com/heydamir/unslop); it is not covered by Flick's MIT license.
