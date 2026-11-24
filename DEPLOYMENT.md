# 🚀 Kiara Medicals - Production Deployment Guide

This document provides complete instructions for deploying the **Kiara Medicals** full-stack pharmacy management system in a production environment.

---

## 📋 System Architecture

- **Frontend:** React 19 SPA built with Vite (optimized production static build in `client/dist`).
- **Backend:** Node.js Express 5 API running in `server/`, serving both REST API (`/api/*`) and static client files (`client/dist`).
- **Database:** MySQL 8.0+ / 8.4 with persistent connection pool and automated fallback mock engine.
- **Roles:**
  - `ADMIN`: Global overview, branches management, user account management, consolidated analytics.
  - `SHOP_MANAGER`: Branch manager with full shop operations (Billing, Past Bills, Stock Purchase, Supplier Returns, Customer Returns, Edit Bills, Unbilled Sales, Stock Alerts, Branch Analytics).
  - `SHOP_USER`: Branch staff handling counter billing, returns, inventory lookups, and shop operations.

---

## 🐳 Option 1: Docker Compose Deployment (Recommended)

Docker Compose deploys the complete stack (MySQL + Application container) in one command.

### Prerequisites
- Docker Engine 24+ and Docker Compose v2 installed.

### Steps:
1. Clone the repository onto your production server:
   ```bash
   git clone <repo-url> /var/www/kiara-medicals
   cd /var/www/kiara-medicals
   ```

2. Configure environment variables in `docker-compose.yml`:
   - Change `MYSQL_ROOT_PASSWORD`
   - Change `JWT_SECRET` to a secure random string:
     ```bash
     openssl rand -base64 32
     ```

3. Launch the stack:
   ```bash
   docker compose up -d --build
   ```

4. Check container status:
   ```bash
   docker compose ps
   docker compose logs -f app
   ```

5. The system will be live at `http://YOUR_SERVER_IP:5000`.

---

## 🖥️ Option 2: VPS Deployment with PM2 & Nginx (Ubuntu / Debian)

### 1. Install System Dependencies
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx

# Install PM2 globally
sudo npm install -g pm2
```

### 2. Setup MySQL Database
```bash
# Install MySQL server
sudo apt install -y mysql-server
sudo mysql_secure_installation

# Create database and user
sudo mysql -u root -p
```
Inside MySQL shell:
```sql
CREATE DATABASE kiara_medicals CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'kiara_user'@'localhost' IDENTIFIED BY 'StrongPassword123!';
GRANT ALL PRIVILEGES ON kiara_medicals.* TO 'kiara_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Run schema and migrations:
```bash
mysql -u kiara_user -p kiara_medicals < database/schema.sql
mysql -u kiara_user -p kiara_medicals < database/seed.sql
mysql -u kiara_user -p kiara_medicals < database/migrations/002_purchases_returns_analytics.sql
mysql -u kiara_user -p kiara_medicals < database/migrations/005_add_shop_roles.sql
```

Create default test users:
```bash
cd /var/www/kiara-medicals/server
node createTestUsers.js
```

### 3. Build Frontend & Install Dependencies
```bash
cd /var/www/kiara-medicals

# Install server dependencies
cd server
npm ci --production

# Build React client
cd ../client
npm ci
npm run build
```

### 4. Configure Server Environment
Create `/var/www/kiara-medicals/server/.env`:
```env
PORT=5000
NODE_ENV=production
DB_HOST=localhost
DB_PORT=3306
DB_USER=kiara_user
DB_PASSWORD=StrongPassword123!
DB_NAME=kiara_medicals
JWT_SECRET=super_secret_jwt_key_at_least_32_characters_long
```

### 5. Start with PM2
```bash
cd /var/www/kiara-medicals/server
pm2 start index.js --name "kiara-medicals"
pm2 save
pm2 startup
```

### 6. Configure Nginx & SSL (Certbot)
Create `/etc/nginx/sites-available/kiara`:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Enable site and install SSL certificate:
```bash
sudo ln -s /etc/nginx/sites-available/kiara /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Install free Let's Encrypt SSL
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## ☁️ Option 3: Cloud PaaS Deployment (Render / Railway)

### Render:
1. Create a **Web Service** pointing to this repository.
2. Build Command:
   ```bash
   npm --prefix client install && npm --prefix client run build && npm --prefix server install
   ```
3. Start Command:
   ```bash
   node server/index.js
   ```
4. Environment Variables:
   - `NODE_ENV`: `production`
   - `PORT`: `5000`
   - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: Your cloud MySQL instance.
   - `JWT_SECRET`: Random 32+ character string.

---

## 👥 Default Roles & Test Credentials

| Role | Username | Password | Branch | Key Permissions |
|---|---|---|---|---|
| **Admin** | `testadmin` | `Admin@12345` | Global | Branch oversight, User management, Consolidated analytics |
| **Shop Manager** | `managera` | `ManagerA@12345` | Kiara Medicals A | Full shop operations: Billing, Past Bills, Purchases, Returns, Edit Bills, Unbilled, Alerts, Analytics |
| **Shop User A** | `shopa` | `ShopA@12345` | Kiara Medicals A | Standard branch user |
| **Shop User B** | `shopb` | `ShopB@12345` | Kiara Medicals B | Standard branch user |
| **Shop User C** | `shopc` | `ShopC@12345` | Kiara Medicals C | Standard branch user |

---

## 🧾 GST Invoice Customization

The GST invoice has been formatted to match the official retail tax invoice standard:
- **Header:** `KIARA MEDICAL AND PROVISION STORE`, Rajput Colony, Jaipur.
- **GSTIN:** `08ABCFK5291Q1ZM`
- **D.L. No:** `DRUG/2024-25/117477-117478`
- **Columns:** `SN.` | `PRODUCT NAME` | `PACK` | `DISC` | `HSN` | `BATCH` | `EXP` | `QTY` | `MRP` | `SGST` | `CGST` | `AMOUNT`
- **Formula Row:** `GST [Taxable]*2.5%+2.5%=[SGST]SGST+[CGST]CGST, ** GET WELL SOON **`
- **Terms & Jurisdiction:** Jaipur Jurisdiction, Doctor consultation advisory, Authorised signatory.
