# Inventory & Order Management System

A production-ready full-stack inventory and order management application built for the technical assessment.

## Stack

- Backend: Python, FastAPI, SQLAlchemy
- Frontend: React, Vite
- Database: PostgreSQL
- Containerization: Docker and Docker Compose

## Features

- Product CRUD with unique SKU validation and non-negative stock validation
- Customer create/list/detail/delete with unique email validation
- Order create/list/detail/delete
- Backend-calculated order totals
- Automatic stock reduction when an order is created
- Inventory checks that prevent orders when stock is insufficient
- Dashboard summary for products, customers, orders, and low-stock products
- Responsive React interface with validation and success/error messages

## Local Setup

Copy the example environment file and choose your credentials:

```bash
cp .env.example .env
```

Run the full stack:

```bash
docker compose up --build
```

Open:

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

## API Endpoints

Products:

- `POST /products`
- `GET /products`
- `GET /products/{id}`
- `PUT /products/{id}`
- `DELETE /products/{id}`

Customers:

- `POST /customers`
- `GET /customers`
- `GET /customers/{id}`
- `DELETE /customers/{id}`

Orders:

- `POST /orders`
- `GET /orders`
- `GET /orders/{id}`
- `DELETE /orders/{id}`

Dashboard:

- `GET /dashboard`

Health:

- `GET /health`

## Environment Variables

Backend:

- `DATABASE_URL`: PostgreSQL connection string, for example `postgresql+psycopg://inventory:password@db:5432/inventory`

Frontend:

- `VITE_API_BASE_URL`: Public backend API URL used by the React app

Docker Compose database:

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`

## Deployment Guide

Backend on Render:

1. Create a PostgreSQL database on Render.
2. Create a new Web Service from this repository.
3. Set the root directory to `backend`.
4. Use Docker as the environment.
5. Add `DATABASE_URL` from the Render PostgreSQL connection string.
6. Deploy and confirm `https://your-backend.onrender.com/health` returns `{"status":"ok"}`.

Frontend on Vercel:

1. Import this repository into Vercel.
2. Use the root directory `/` or set the root to the repository root.
3. Vercel will use `vercel.json` to build the frontend from `frontend/package.json`.
4. Add `VITE_API_BASE_URL=https://your-backend.onrender.com`.
5. Build command: `npm run build`.
6. Output directory: `dist`.
7. Deploy and verify product, customer, and order workflows.

Docker Hub backend image:

```bash
docker build -t your-dockerhub-username/inventory-backend:latest ./backend
docker push your-dockerhub-username/inventory-backend:latest
```

## Submission Checklist

- GitHub repository link: add after pushing this project to GitHub
- Docker Hub backend image link: add after pushing the backend image
- Live frontend deployment URL: add after deploying frontend
- Live backend API URL: add after deploying backend
