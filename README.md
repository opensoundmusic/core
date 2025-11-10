# Open Sound Core

## Overview
Open Sound Core is the self-hosted backend server of the Open Sound ecosystem.  
It provides a complete Node.js and PocketBase-based platform for hosting and streaming a personal music library entirely on the user’s own hardware.  

The system is designed for privacy, control, and modularity, supporting plugin integrations such as the optional YTMusic Plugin for metadata or downloads.

---

## Features
- **Dockerized Deployment** – Run the backend and database using Docker and Docker Compose.
- **PocketBase Integration** – Lightweight open-source database with REST and real-time APIs.
- **Modular Plugin System** – Extend functionality (e.g., metadata fetching, YouTube integration).
- **WebSocket Server** – Real-time updates and messaging between backend and client.
- **Worker and Queue System** – Asynchronous background processing via amqplib.
- **API-Driven Architecture** – Express.js endpoints for services, plugins, and song management.
- **Self-Hosted** – All music, data, and configuration stay local on the user’s machine.

---

## Technology Stack
| Component | Purpose |
|------------|----------|
| **Node.js 18 (Bookworm)** | Main backend runtime |
| **PocketBase** | Lightweight embedded database |
| **Docker & Docker Compose** | Deployment and orchestration |
| **Express 5** | API layer |
| **WebSocket (ws)** | Real-time updates |
| **amqplib** | Message queue management |
| **axios / node-fetch** | External data and API utilities |

---

## File Structure
```
open_sound/
├── db/                      # PocketBase database and Docker setup
│   ├── Dockerfile
├── docker-compose.yaml       # Combined server + database deployment
├── docker-compose.pocketbase.yaml
├── server.mjs                # Main server entry
├── worker.mjs                # Background task handler
├── plugin-manager.mjs        # Plugin loader
├── setup_db.mjs              # Schema initialization for PocketBase
├── routes/                   # Express routes
├── services/                 # Core services
├── socket/                   # WebSocket server
├── plugins/                  # External plugin modules
└── db/pb_schema.json         # PocketBase schema definition
```

---

## Deployment

### 1. Clone the Repository
```bash
git clone https://github.com/opensoundmusic/core.git
cd core
```

### 2. Environment Configuration
Create a `.env` file with your desired configuration values (admin credentials, ports, etc.).

### 3. Build and Run
To set up and run both the backend and PocketBase automatically:

```bash
chmod +x run.bash
./run.bash
```

This script will handle:
- Building and starting the Docker containers
- Initializing PocketBase with the correct schema
- Setting up environment variables
- Launching the Node.js backend and WebSocket services

### 4. Access
- Backend API: `http://localhost:1212`
- WebSocket server: `ws://localhost:1214`
- PocketBase admin console: `http://localhost:8090/_/`

---

## Plugin System
The backend supports a modular plugin interface located under the `plugins/` directory.  
Plugins can provide additional functionality such as search, metadata, or download integrations.

Example: The YTMusic Plugin enables YouTube Music search and download features using unofficial APIs.  
It operates separately and is installed manually by the user.  
The main backend remains fully functional without any plugin.

---

## Legal Notice
Open Sound Core does not host, distribute, or stream copyrighted material.  
All media files are stored locally by the user.  
The maintainers of Open Sound are not affiliated with YouTube, Google LLC, or any other service provider.  
Plugins that connect to third-party platforms are optional and used at the user’s own discretion and responsibility.

See [DISCLAIMER.md](DISCLAIMER.md) for full legal terms and usage conditions.

---

## License
Licensed under the MIT License. See [LICENSE](LICENSE) for details.
