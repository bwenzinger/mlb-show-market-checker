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

## Useful Commands

```bash
npm run collect:once
npm run market-server
npm run typecheck
npm run build
```

