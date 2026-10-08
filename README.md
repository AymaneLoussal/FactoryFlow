# FactoryFlow API

Initial backend setup for the FactoryFlow production management API.

## Requirements

- Node.js 20 or later
- MongoDB, or Docker with Docker Compose

## Run locally

Install dependencies with `npm install`, then start MongoDB locally. Copy `.env.example` to `.env` and set `MONGO_URI` to your local MongoDB address (for example, `mongodb://localhost:27017/factoryflow`). Run `npm run dev` for development or `npm start` to start the API.

## Run with Docker Compose

Run `docker compose up --build`. The API is available at `http://localhost:3000` and connects to the `mongo` service. Source changes are mounted into the API container and nodemon restarts the server. MongoDB data is stored in the `mongo_data` named volume.

Stop the services with `docker compose down`. Use `docker compose logs -f` to follow logs. The named database volume remains after stopping; `docker compose down -v` removes it.

## Health endpoint

`GET /api/health` returns HTTP 200 and a JSON response indicating the API is running.

## Initial structure

Routes direct requests to controllers. The health controller currently returns a simple status response. `server.js` loads environment configuration, connects to MongoDB through `src/config/database.js`, then starts the Express app exported by `src/app.js`. Services, repositories, and models are reserved for later implementation and are not populated in this phase.
