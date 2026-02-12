# Event Ticketing System

A comprehensive web-based application for managing event tickets, reservations, and back-office operations. This system provides interfaces for both customers and administrative staff, featuring QR code integration and automated promotional warnings.

## 🚀 Features

### Customer Interface
- **Event Browsing**: View available events and details.
- **Ticket Reservation**: Seamless booking process for users.
- **Contact Support**: easy way for customers to reach out.

### Back Office / Administration
- **Dashboard**: specialized interface for staff to manage events and bookings.
- **QR Code Management**: Generation and handling of QR codes for ticket verification.
- **Automated Alerts**: System includes `promo_warning.js` for handling promotional notifications.
- **Database Integration**: Robust backend for data persistence.

## 🛠️ Technology Stack

- **Backend**: Node.js, Express.js
- **Frontend**: HTML5, CSS3, JavaScript
- **Database**: SQL (based on `db.js` configuration)

## 📂 Project Structure

```bash
Event-Ticketing-System/
├── backend/            # Server-side logic, API routes, and database connection
│   ├── controllers/    # Request handlers
│   ├── routes/         # API endpoints
│   ├── db.js          # Database configuration
│   └── server.js      # Main application entry point
│
└── frontend/           # Client-side files
    ├── customer/       # Customer-facing pages (Home, Reserve, Contact)
    └── back_officer/   # Administrative interface
```

## 🔧 Installation & Setup

1.  **Clone the repository**
    ```bash
    git clone https://github.com/Harmonybod/Event-Ticketing-System.git
    cd Event-Ticketing-System
    ```

2.  **Install Backend Dependencies**
    Navigate to the backend directory and install the required packages:
    ```bash
    cd backend
    npm install
    ```

3.  **Configure Environment**
    Create a `.env` file in the `backend/` directory with your database credentials and port configuration.

4.  **Run the Application**
    Start the backend server:
    ```bash
    npm start
    # or
    node server.js
    ```

5.  **Access the Frontend**
    Open the `frontend/customer/home.html` file in your browser to view the customer interface.

## 📝 License

This project is open source and available under the [MIT License](LICENSE).
