# MLB The Show Market Checker

React frontend plus a Node/SQLite market backend for MLB The Show 26.

## Local Development

```bash
npm install
npm run dev
```

`npm run dev` starts both the market backend and the Vite frontend. The frontend calls the backend through `/api`.

## Single-Machine Public Hosting

On the Linux machine:

```bash
git clone <your-repo-url>
cd mlb-show-market-checker
npm install
cp .env.example .env
npm run build
npm start
```

For public access, set this in `.env`:

```bash
MARKET_SERVER_HOST=0.0.0.0
MARKET_SERVER_PORT=4000
MARKET_DB_PATH=./market.sqlite
```

The Node process will:

- serve the built React app from `dist/`
- proxy browser requests to the MLB The Show API through `/api/show`
- expose stored completed orders through `/api/cards/:uuid/orders`
- run the collector immediately, then once per hour by default
- store market history in the SQLite file configured by `MARKET_DB_PATH`

For a real public site, put this behind a reverse proxy such as Caddy or Nginx and point your domain to the Linux machine. The app can also be exposed directly on port `4000` if your firewall and router allow it.

## Run Permanently On Linux

There is no honest way to guarantee 100% uptime on one computer: power loss, disk failure, OS crashes, router/ISP outages, and upstream API outages can still take the app down. The best single-machine setup is a `systemd` service that starts on boot and restarts the app after crashes, paired with a UPS and external monitoring.

This repo requires Node 25+. Check first:

```bash
node --version
```

If your version is older than 25, install Node 25+ with your preferred Node version manager or package source, then reopen your shell so `node` and `npm` point at the new version.

If you already use `nvm`, this repo includes `.nvmrc`, so `nvm install` and `nvm use` will select Node 25.

After Node 25+ is active:

```bash
bash scripts/install-systemd-service.sh
```

The installer will:

- create `.env` from `.env.example` if it is missing
- run `npm ci`
- build the frontend with `npm run build`
- install `/etc/systemd/system/mlb-show-market-checker.service`
- enable and start the service

Useful service commands:

```bash
sudo systemctl status mlb-show-market-checker
sudo journalctl -u mlb-show-market-checker -f
sudo systemctl restart mlb-show-market-checker
curl http://127.0.0.1:4000/api/health
```

For the closest thing to always-on from one machine, also enable "restore power after AC loss" in BIOS/UEFI, use a UPS, keep the machine on wired ethernet, back up `market.sqlite`, and monitor `/api/health` from somewhere outside your home network.

## Useful Commands

```bash
npm run collect:once
npm run market-server
npm run typecheck
npm run build
```
