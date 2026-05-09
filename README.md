# Fixnar CMMS

Facility & Maintenance Management System for F&B operations.

## Tech Stack
- **Frontend**: React 18
- **Database**: Supabase (PostgreSQL)
- **Hosting**: Vercel
- **Code**: GitHub

## Setup Guide

### Step 1 — Supabase Database
1. Go to your Supabase project dashboard
2. Click **SQL Editor** in the left menu
3. Paste the entire contents of `supabase_schema.sql`
4. Click **Run** — all tables and security rules are created

### Step 2 — Create your admin account
1. In Supabase → **Authentication** → **Users** → **Invite User**
2. Enter your email, send invite
3. Open the email, set your password
4. Go back to **Table Editor** → **profiles** table
5. Find your user row, change `role` to `admin`

### Step 3 — GitHub
1. Create a new repository on github.com named `fixnar`
2. Upload all files from this folder to the repo

### Step 4 — Vercel Deployment
1. Go to vercel.com → **New Project**
2. Import your GitHub `fixnar` repository
3. Framework: **Create React App**
4. Click **Deploy**
5. Your app will be live in ~2 minutes!

## Roles
| Role | Access |
|------|--------|
| **Admin** | Full access to all modules |
| **Technician** | Work orders assigned to them + schedule + PPM |
| **Operations** | Their restaurant only — create & track work orders |

## SLA Rules (Working hours: 9AM–6PM)
| Priority | SLA |
|----------|-----|
| P1 — Critical | 4 working hours |
| P2 — High | 8 working hours |
| P3 — Medium | 12 working hours |
| P4 — Low | 7 working days |
| PPM | 3 months |

> SLA timer pauses outside working hours and resumes next business day at 9AM.

## Modules
- **Dashboard** — KPIs, open work orders, quick actions
- **Work Orders** — Create, assign, track with live SLA timer
- **Assets** — Equipment registry per store
- **PPM Schedule** — Preventive maintenance with 3-month SLA
- **Technician Schedule** — Priority queue + week view
- **Analytics** — Charts, SLA compliance, store breakdown
- **Users & Access** — Role-based access control

## Coming Next (Phase 3)
- Technician map view with store locations
- Mobile app (React Native)
- Email/SMS notifications for SLA breaches
- PDF report export
