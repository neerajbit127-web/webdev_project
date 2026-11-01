# PageShelf 📚

[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-v4-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-v14+-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![HTML5 & CSS3](https://img.shields.io/badge/Frontend-HTML5%20%2F%20CSS3%20(Pure)-E34F26?logo=html5&logoColor=white)](https://developer.mozilla.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Buy, rent, and sell second-hand books right in your neighborhood.**  
> PageShelf is a lightweight, full-stack peer-to-peer marketplace that promotes sustainable reading and circular economy by connecting local book lovers.

---

## 📑 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Rental & Deposit Lifecycle](#rental--deposit-lifecycle)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation & Setup](#installation--setup)
  - [Database Setup](#database-setup)
  - [Environment Variables](#environment-variables)
  - [Running the Application](#running-the-application)
- [Database Schema](#database-schema)
- [API Overview](#api-overview)
- [Roadmap](#roadmap)
- [License](#license)

---

## 🌟 Overview

Physical books often sit idle on bookshelves after a single read. **PageShelf** transforms passive bookshelves into local community libraries and micro-marketplaces:
- **Affordable Access**: Rent textbooks and bestsellers for short durations without paying full retail price.
- **Monetize Your Shelf**: Earn by selling or renting out pre-loved copies.
- **Pure HTML & CSS**: Built purely with Semantic HTML5 and responsive Modern CSS (zero JavaScript on the client) on top of a battle-tested Node.js + Express + PostgreSQL stack.

---

## ✨ Key Features

### 🔐 Authentication & Profiles
- Secure user signup and login with **bcryptjs** password hashing.
- Secure session handling with **HTTP-only Cookie-based JWT** (seamless native HTML `<form>` submissions without client-side JS).
- User profile management with customizable delivery address and contact details.

### 🔍 Discovery & Advanced Filtering
- Search across books by **Title**, **Author**, or **ISBN-10/13**.
- Filter results by **Category/Genre**, **Availability (Buy vs. Rent)**, **Book Condition** (*Like New*, *Very Good*, *Good*, *Acceptable*), and **City/Neighborhood**.
- Sorting by price, rental rate, or date listed.

### 📦 Flexible Listing Modes
- **Sell Only**: Set an outright selling price.
- **Rent Only**: Set a weekly rental rate, minimum/maximum rental duration, and a refundable security deposit.
- **Dual Mode**: Allow the buyer to choose between purchasing outright or renting.

### 🚚 Purchasing Flow
- Simple checkout flow with delivery address selection.
- Initial support for **Pay on Delivery (COD)** with status tracking (*Pending*, *Confirmed*, *Delivered*, *Cancelled*).

### ⏳ Rental & Deposit Escrow Workflow
- Borrowers rent books for $N$ weeks by providing the rental fee + refundable security deposit upfront.
- Due date tracking with automatic overdue calculation.
- Owner inspects and confirms book return.
- **Automatic Settlement**: Late fees ($LateDays \times DailyRate$) are calculated and deducted automatically from the security deposit before the remainder is released.

### 💖 Social & Dashboard
- **Wishlist**: Save books for later and get notified when listed nearby.
- **Ratings & Reviews**: Leave verified feedback and star ratings after completing purchases or rentals.
- **Personal Dashboard**: Track active rentals, sales revenue, listed books, and purchase history in one place.
- **Admin Moderation**: Admin endpoints for monitoring users, approving listings, and managing disputes.

---

## 🛠️ Tech Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | Pure HTML5, CSS3 | Zero client-side JavaScript, native HTML5 forms, modern responsive CSS layout & UI states |
| **Backend** | Node.js, Express.js | RESTful modular API server |
| **Database** | PostgreSQL | Relational database with strict constraints and foreign keys |
| **Database Driver** | `pg` (node-postgres) | Connection pooling and query optimization |
| **Authentication** | HTTP-only Cookie JWT & `bcryptjs` | Cookie-based JWT auth for native HTML `<form>` submissions without client JS |
| **Environment** | `dotenv` | Centralized environment configuration |

---

## 🔄 Rental & Deposit Lifecycle

```
[Borrower requests rental for N weeks]
                  │
                  ▼
   [Borrower pays Rental Fee + Deposit]
                  │
                  ▼
           [Book Dispatched]
                  │
                  ▼
     [Borrower returns book by due date]
                  │
                  ▼
        [Owner inspects book]
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
 [Returned on time]    [Returned late]
        │                   │
        │             Late Fee = (Overdue Days × Daily Late Fee)
        │                   │
        ▼                   ▼
 [Full deposit        [Refund = Deposit - Late Fees]
   refunded]                │
        └─────────┬─────────┘
                  ▼
       [Rental Marked Completed]
```

---

## 📂 Project Structure

```text
pageshelf/
├── server.js               # Express application entry point & route registration
├── package.json            # Project manifest, scripts, and dependencies
├── .env.example            # Sample environment variables template
├── README.md               # Project documentation
│
├── routes/                 # Express REST API routes
│   ├── auth.js             # Register, login, refresh token, profile
│   ├── books.js            # Book catalog (search, lookup by ISBN/title)
│   ├── listings.js         # User copy listings (create, update, toggle buy/rent)
│   ├── orders.js           # Buy orders and delivery status
│   ├── rentals.js          # Rental checkout, returns, and deposit settlement
│   ├── reviews.js          # Ratings & reviews for books and users
│   ├── wishlist.js         # Wishlist management
│   └── admin.js            # System metrics, user moderation, dispute resolution
│
├── middleware/             # Custom Express middleware
│   ├── auth.js             # JWT verification & role authorization (user/admin)
│   ├── validate.js         # Input sanitization and payload validation
│   └── errorHandler.js     # Centralized error handler and response formatter
│
├── db/                     # Database scripts & configuration
│   ├── pool.js             # PostgreSQL connection pool instance (`pg`)
│   ├── schema.sql          # Tables, constraints, enums, triggers, and indexes
│   └── seed.sql            # Initial categories, sample books, and demo users
│
└── public/                 # Static frontend assets (Pure HTML & CSS)
    ├── index.html          # Marketplace landing & book catalog
    ├── login.html          # User login page
    ├── register.html       # User registration page
    ├── book.html           # Book details & rental / purchase forms
    ├── new-listing.html    # Add copy listing form
    ├── dashboard.html      # User rentals, purchases, and active listings
    └── css/
        ├── style.css       # Design tokens, variables, typography, and base styles
        └── components.css  # Cards, pure CSS modals/tabs, buttons, forms, and layout grid
```

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed on your machine:
- [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended)
- [PostgreSQL](https://www.postgresql.org/download/) (v14 or higher)
- [Git](https://git-scm.com/)

---

### Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/pageshelf.git
   cd pageshelf
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

---

### Database Setup

1. Create a new PostgreSQL database:
   ```bash
   # In psql or your preferred PostgreSQL GUI:
   CREATE DATABASE pageshelf;
   ```

2. Execute the schema and seed files:
   ```bash
   # Using psql CLI:
   psql -U postgres -d pageshelf -f db/schema.sql
   psql -U postgres -d pageshelf -f db/seed.sql
   ```

---

### Environment Variables

Copy the example environment file and configure your credentials:

```bash
cp .env.example .env
```

Edit `.env` to match your local setup:

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `PORT` | Port the Express server listens on | `5000` |
| `NODE_ENV` | Environment mode (`development` / `production`) | `development` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:password@localhost:5432/pageshelf` |
| `JWT_SECRET` | Secret key for signing JWT auth tokens | `your_super_secret_jwt_key` |
| `JWT_EXPIRES_IN` | Lifespan of the authentication token | `7d` |

---

### Running the Application

- **Development mode** (with hot reload via nodemon):
  ```bash
  npm run dev
  ```

- **Production mode**:
  ```bash
  npm start
  ```

Once running, access the web interface at **`http://localhost:5000`**.

---

## 🗄️ Database Schema

The core relational architecture consists of the following key entities:

- **`users`**: User accounts (name, email, password hash, phone, city, address, role).
- **`categories`**: Book genres (Fiction, Non-fiction, Tech, Academic, etc.).
- **`books`**: Master book catalog metadata (title, author, ISBN, description, cover image).
- **`listings`**: Physical copies listed by owners (`book_id`, `owner_id`, `condition`, `listing_type` [BUY, RENT, BOTH], `price`, `rental_rate_per_week`, `deposit`, `is_available`).
- **`orders`**: Outright purchases (`buyer_id`, `listing_id`, `total_amount`, `delivery_address`, `status`).
- **`rentals`**: Rental leases (`renter_id`, `listing_id`, `weeks`, `start_date`, `due_date`, `return_date`, `deposit_amount`, `late_fee_paid`, `deposit_refunded`, `status`).
- **`reviews`**: Ratings (1-5 stars) and comments on books and seller transactions.
- **`wishlist`**: Saved items mapping `user_id` to `book_id`.

---

## 📡 API Overview

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `POST` | `/api/auth/register` | Register a new user | No |
| `POST` | `/api/auth/login` | Authenticate and obtain JWT | No |
| `GET` | `/api/auth/me` | Fetch currently logged-in user profile | Yes |
| `GET` | `/api/books` | Search books by keyword, genre, ISBN, city | No |
| `GET` | `/api/books/:id` | Get book details and active listings | No |
| `POST` | `/api/listings` | Create a new listing (sale, rent, or both) | Yes |
| `PATCH` | `/api/listings/:id` | Update listing price, condition, or status | Yes |
| `POST` | `/api/orders` | Place a purchase order (Pay on delivery) | Yes |
| `POST` | `/api/rentals` | Initiate a rental with deposit | Yes |
| `PATCH` | `/api/rentals/:id/return` | Owner confirms return & calculates deposit refund | Yes |
| `GET` | `/api/wishlist` | View current user's wishlist | Yes |
| `POST` | `/api/wishlist/:bookId` | Add book to user wishlist | Yes |
| `POST` | `/api/reviews` | Submit a review for a book / transaction | Yes |
| `GET` | `/api/admin/metrics` | System statistics (admin only) | Yes (Admin) |

---

## 🗺️ Roadmap

- [ ] Online Payment Gateway integration (Stripe / Razorpay)
- [ ] Interactive neighborhood map view with geolocation search
- [ ] Direct buyer-to-seller messaging / real-time chat
- [ ] Push / Email notifications for overdue rental reminders
- [ ] Barcode / ISBN scanning directly from phone camera

---

## 📄 License

This project is licensed under the [MIT License](LICENSE). Feel free to use, modify, and distribute as per the terms