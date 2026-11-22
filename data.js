
// data.js - Storage, sample data and calculation helpers
// All data is kept in the browser's localStorage, so no server or database is needed.

const KEY = 'salesdesk_db';
const HIGH_VALUE = 2800; // Total spend that marks a high-value customer
const FREQUENT = 3;      // Number of orders that marks a frequent customer


/* DATE HELPERS (LOCAL TIME)*/

const fmt = d =>
    d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');

const today = () => fmt(new Date());

const daysAgo = n => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return fmt(d);
};

const addDays = (s, n) => {
    const [y, m, d] = s.split('-').map(Number);
    return fmt(new Date(y, m - 1, d + n));
};

const daysBetween = (a, b) =>
    Math.round((new Date(b) - new Date(a)) / 864e5);


/*SAMPLE DATA */

function seed() {

    // Product information
    const products = [
        {
            id: 1,
            name: 'Basmati Rice 5kg',
            category: 'Groceries',
            price: 520,
            stock: 4,
            min: 10
        },
        {
            id: 2,
            name: 'Soybean Oil 1L',
            category: 'Groceries',
            price: 180,
            stock: 40,
            min: 15
        },
        {
            id: 3,
            name: 'Sugar 1kg',
            category: 'Groceries',
            price: 130,
            stock: 60,
            min: 20
        },
        {
            id: 4,
            name: 'Mobile Charger',
            category: 'Electronics',
            price: 450,
            stock: 6,
            min: 8
        },
        {
            id: 5,
            name: 'Earphones',
            category: 'Electronics',
            price: 350,
            stock: 25,
            min: 10
        },
        {
            id: 6,
            name: 'Notebook A4',
            category: 'Stationery',
            price: 90,
            stock: 100,
            min: 30
        },
        {
            id: 7,
            name: 'Ball Pen Box',
            category: 'Stationery',
            price: 120,
            stock: 8,
            min: 12
        },
        {
            id: 8,
            name: 'Laundry Soap',
            category: 'Household',
            price: 85,
            stock: 50,
            min: 15
        }
    ];


    // Customer information
    const cust = (id, name, phone, email, address, notes, ago) => ({
        id,
        name,
        phone,
        email,
        address,
        notes,
        created: daysAgo(ago)
    });

    const customers = [
        cust(
            1,
            'Rahim Traders',
            '01711000001',
            'rahim@example.com',
            'Sirajganj Sadar',
            'Prefers bulk orders',
            90
        ),
        cust(
            2,
            'Nasrin Akter',
            '01711000002',
            'nasrin@example.com',
            'Ullapara',
            'Pays by mobile banking',
            90
        ),
        cust(
            3,
            'City Mart',
            '01711000003',
            'citymart@example.com',
            'Shahjadpur',
            'Net 15-day credit',
            90
        ),
        cust(
            4,
            'Karim Store',
            '01711000004',
            '',
            'Kazipur',
            '',
            90
        ),
        cust(
            5,
            'Sumi Enterprise',
            '01711000005',
            '',
            'Belkuchi',
            '',
            90
        ),
        cust(
            6,
            'Green Valley School',
            '01711000006',
            'office@gvs.example.com',
            'Sirajganj Sadar',
            'Stationery buyer',
            90
        ),
        cust(
            7,
            'Old Corner Shop',
            '01711000007',
            '',
            'Tarash',
            'No recent orders',
            120
        )
    ];


    // Sale helper:
    // sale(id, customerId, staff, daysAgo, [[productId, qty]], discount, amountPaid, method)

    const sale = (id, customerId, user, ago, list, discount, paid, method) => {

        const date = daysAgo(ago);

        const items = list.map(([pid, qty]) => {
            const p = products.find(x => x.id === pid);

            return {
                pid,
                name: p.name,
                cat: p.category,
                qty,
                price: p.price
            };
        });

        const total =
            items.reduce((t, i) => t + i.qty * i.price, 0) - discount;

        return {
            id,
            invoice: 'INV-' +
                new Date().getFullYear() + '-' +
                String(id).padStart(5, '0'),

            customerId,
            user,
            date,
            due: addDays(date, 15),
            items,
            discount,
            total,

            payments: paid
                ? [{ amount: paid, method, date }]
                : []
        };
    };


    // Sample sales records
    const sales = [
        sale(1, 1, 'staff', 45, [[1, 2], [2, 1]], 20, 1200, 'cash'),
        sale(2, 2, 'staff', 38, [[4, 2], [5, 1]], 50, 1200, 'mobile'),
        sale(3, 3, 'admin', 33, [[6, 10], [7, 5]], 0, 1500, 'bank'),
        sale(4, 1, 'staff', 25, [[3, 5], [8, 4]], 0, 500, 'cash'),
        sale(5, 4, 'staff', 20, [[1, 3]], 60, 0),
        sale(6, 2, 'staff', 12, [[5, 2], [4, 1]], 0, 1150, 'mobile'),
        sale(7, 5, 'admin', 9, [[2, 6], [3, 4]], 100, 1000, 'bank'),
        sale(8, 1, 'staff', 6, [[1, 1], [8, 2]], 0, 690, 'cash'),
        sale(9, 6, 'admin', 3, [[6, 20], [7, 10]], 150, 2850, 'mobile'),
        sale(10, 3, 'staff', 1, [[4, 3], [2, 2]], 10, 0)
    ];


    // Return complete database
    return {
        users: [
            {
                username: 'admin',
                name: 'Business Owner',
                password: 'admin123',
                role: 'admin'
            },
            {
                username: 'staff',
                name: 'Sales Staff',
                password: 'staff123',
                role: 'staff'
            }
        ],

        products,
        customers,
        sales,
        logs: [],

        settings: {
            target: 20000
        }
    };
}


/* =========================================================
   LOAD / SAVE DATA
========================================================= */

let DB = JSON.parse(localStorage.getItem(KEY) || 'null') || seed();

let session = JSON.parse(
    sessionStorage.getItem('sd_session') || 'null'
);

const save = () =>
    localStorage.setItem(KEY, JSON.stringify(DB));


const log = (action, details = '') => {

    DB.logs.unshift({
        time: new Date().toLocaleString(),
        user: session ? session.user : '-',
        action,
        details
    });

    // Keep only the latest 100 log entries
    DB.logs = DB.logs.slice(0, 100);

    save();
};


/* =========================================================
   CALCULATION HELPERS
========================================================= */

// Calculate total amount paid
const paidOf = s =>
    s.payments.reduce((t, p) => t + p.amount, 0);


// Calculate remaining due amount
const dueOf = s =>
    s.total - paidOf(s);


// Determine payment status
const statusOf = s =>
    paidOf(s) >= s.total
        ? 'paid'
        : paidOf(s) > 0
            ? 'partial'
            : 'unpaid';


// Check whether a sale is overdue
const isOverdue = s =>
    dueOf(s) > 0 && s.due < today();


// Format currency
const money = n =>
    'Tk ' +
    Number(n).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
