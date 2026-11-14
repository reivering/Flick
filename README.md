# Flick

Share a file between your phone and computer from a browser. No account or app installation required.

Choose **Receive** on one device, then scan its QR code or enter its eight-digit code on the other device. Select one or more files and tap **Flick to send**, or swipe upward on the file list. The receiving device can view supported images and download the original file.

## Features

- Share multiple files at once, each smaller than 1 GB, with individual progress
- Pair with a QR code or an eight-digit code
- Preview JPEG, PNG, GIF, WebP, PDFs, and supported MP4, WebM, and Ogg videos; download files unchanged
- Reopen received files from the file icon in the same browser, until they expire
- Resume interrupted uploads by retrying or reselecting the same files in the same browser tab
- Delete received files early or let them expire automatically after 24 hours

## Getting started

You need [Node.js](https://nodejs.org/) 22.13 or newer and npm.

```sh
git clone https://github.com/reivering/Flick.git
cd Flick
npm ci
npm start
```

Open **http://localhost:3000** on the computer running Flick. To connect a second device on the same network, open the server's network address on **both** devices, for example `http://192.168.1.10:3000`. Replace the example IP with your computer's address. A QR code generated at `localhost` will not work on another device because `localhost` refers to that device itself.

Keep Flick on a trusted local network. Both devices must open the same network address; the interface makes no external font requests and works without internet access after dependencies are installed.

## Self-host with Docker

Install [Docker Engine and Docker Compose](https://docs.docker.com/engine/install/), then run:

```sh
git clone https://github.com/reivering/Flick.git
cd Flick
docker compose up -d --build
```

Open `http://localhost:3000` on the host, or use `http://<host-local-ip>:3000` on both devices. The `flick-data` Docker volume holds the database and uploads across container restarts and updates. To use another host port, change the first number in `compose.yaml` (for example, `"4317:3000"`). Make sure your firewall permits access from your local network if you want to use a phone.

```sh
docker compose logs -f       # View server output
docker compose down          # Stop the server; keep stored data
docker compose up -d --build # Rebuild after pulling updates
```

`docker compose down -v` also deletes the persistent volume and any files still in it. Back up the volume separately if you need backups, and give those backups their own deletion policy.

To build and run without Compose:

```sh
docker build -t flick .
docker run -d --name flick -p 3000:3000 -v flick-data:/app/data --restart unless-stopped flick
```

Flick is designed for a single instance with a persistent disk. Keep it on a trusted local network; do not deploy this disk-backed configuration to Vercel Functions or another serverless platform. The server binds to all network interfaces inside the container, so the published port is reachable by other devices on the host's network unless a firewall restricts it.

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

Uploads are split into 4 MiB chunks, and a full-file SHA-256 fingerprint identifies an interrupted upload. After a refresh, choose the same files in the same tab to resume; unfinished uploads expire after 24 hours. Each file is processed in turn. Files are stored unchanged in the data directory; their metadata and connection sessions are held in SQLite. Access expires 24 hours after upload. While the server is running, it checks for expired files once a minute and removes the stored file and its database record. It also checks at startup, so if the server was offline at expiry, physical deletion happens after it restarts. Any backups need their own deletion policy. Downloaded copies remain on the recipient's device.

Received-file history is tied to session cookies in the receiving browser. Clearing those cookies or changing browsers removes access to that history. Files received on other devices do not appear there.

Flick currently runs as a **single server with a persistent disk**; serverless deployments and multiple replicas are not supported. Transfers go through the server and require enough storage for each file. Local HTTP does not encrypt traffic, so use a trusted network. Anyone with a valid pairing code can connect to the corresponding session. The project has not undergone a professional security audit, and the built-in limits are not a complete defense against public abuse. Review the deployment and security requirements before exposing an instance to untrusted users.

## Development

```sh
npm test
```

The tests cover pairing, file transfer, access restrictions, received-file history, and expiry. The interface is plain HTML, CSS, and JavaScript; the server uses Express, Multer, SQLite, a QR-code generator, @noble/hashes, and PDF.js. See [DESIGN.md](DESIGN.md) for the product's design direction.

Issues and pull requests are welcome. Please describe the problem or change, include steps to reproduce bugs, and run the tests before submitting a pull request. Never include real private files, session codes, or credentials in a report.

## License and credits

Flick is licensed under the [MIT License](LICENSE). Dependencies have their own licenses.

The optional project-local [Unslop skill](.agents/skills/unslop/SKILL.md), created by [Damir Sokolovsky](https://github.com/heydamir), is separately licensed under [CC BY 4.0](.agents/skills/unslop/LICENSE). Its source is [heydamir/unslop](https://github.com/heydamir/unslop); it is not covered by Flick's MIT license.
