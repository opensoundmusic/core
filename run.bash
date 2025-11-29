#!/bin/bash
set -e

NETWORK_NAME="opensound-network"

# Check and create .env file if missing or incomplete
echo "Checking .env configuration..."
if [ ! -f .env ]; then
  echo "No .env file found. Creating default .env..."
  cat > .env <<EOF
PORT=1212
RABBIT_MQ_URL=amqp://localhost
DOWNLOAD_QUEUE=download_queue
POCKETBASE_ADDR=http://0.0.0.0:8090
EMAIL=admin@opensound.com
PASSWORD=opensoundPass123
WWS_PORT=1412
EOF
  echo ".env file created with default values."
else
  # Ensure required variables exist
  REQUIRED_VARS=("PORT" "RABBIT_MQ_URL" "DOWNLOAD_QUEUE" "POCKETBASE_ADDR" "EMAIL" "PASSWORD" "WWS_PORT")
  MISSING=false
  for VAR in "${REQUIRED_VARS[@]}"; do
    if ! grep -q "^$VAR=" .env; then
      echo "Missing $VAR in .env"
      MISSING=true
    fi
  done

  if [ "$MISSING" = true ]; then
    echo "Adding missing default values to .env..."
    for VAR in "${REQUIRED_VARS[@]}"; do
      if ! grep -q "^$VAR=" .env; then
        case "$VAR" in
          PORT) echo "PORT=1212" >> .env ;;
          RABBIT_MQ_URL) echo "RABBIT_MQ_URL=amqp://localhost" >> .env ;;
          DOWNLOAD_QUEUE) echo "DOWNLOAD_QUEUE=download_queue" >> .env ;;
          POCKETBASE_ADDR) echo "POCKETBASE_ADDR=http://0.0.0.0:8090" >> .env ;;
          EMAIL) echo "EMAIL=admin@opensound.com" >> .env ;;
          PASSWORD) echo "PASSWORD=opensoundPass123" >> .env ;;
          WWS_PORT) echo "WWS_PORT=1214" >> .env ;;
        esac
      fi
    done
    echo ".env file updated with missing values."
  else
    echo ".env file is complete."
  fi
fi

# Check if network exists, create if not
if ! docker network ls | grep -q "$NETWORK_NAME"; then
  echo "Creating network $NETWORK_NAME..."
  docker network create "$NETWORK_NAME"
else
  echo "Network $NETWORK_NAME already exists."
fi

# Install npm dependencies
echo "Installing Node dependencies..."
npm install

# Start and build PocketBase
echo "Starting PocketBase service..."
docker compose -f docker-compose.pocketbase.yaml up -d --build

# Wait for PocketBase to be healthy
echo "Waiting for PocketBase to become healthy..."
while [ "$(docker inspect -f '{{.State.Health.Status}}' opensound-pocketbase 2>/dev/null)" != "healthy" ]; do
  echo "Waiting for PocketBase..."
  sleep 3
done

echo "PocketBase is healthy."

# Run database setup
echo "Running setup_db.mjs..."
node setup_db.mjs

# Start and build main stack
echo "Starting main server and worker services..."
docker compose build --no-cache
docker compose up -d

echo "All services are running."
