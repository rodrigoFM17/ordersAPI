require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');

// Inicializar Firebase
const serviceAccount = require("./firebaseServiceAccount.json");
const { randomUUID } = require('node:crypto');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Configurar conexión con MySQL
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'orders_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Verificar conexión
db.getConnection((err, connection) => {
    if (err) {
        console.error("Error conectando a la base de datos:", err);
        return;
    }
    console.log("Conectado a MySQL");
    connection.release();
});

// ------------------- CLIENTES -------------------

// Obtener todos los clientes
app.get('/clients', (req, res) => {
    db.query("SELECT * FROM Clients", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Crear un nuevo cliente
app.post('/clients', (req, res) => {
    const { name, phone } = req.body;
    db.query("INSERT INTO Clients (name, phone) VALUES (?, ?)", [name, phone], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: results.insertId, name, phone });
    });
});

// ------------------- PRODUCTOS -------------------

// Obtener todos los productos
app.get('/products', (req, res) => {
    db.query("SELECT * FROM Products", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Crear un nuevo producto
app.post('/products', (req, res) => {
    const { name, price, unit } = req.body;
    db.query("INSERT INTO Products (name, price, unit) VALUES (?, ?, ?)", [name, price, unit], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: results.insertId, name, price, unit });
    });
});

// ------------------- PEDIDOS -------------------

// Obtener todos los pedidos
app.get('/orders', (req, res) => {
    db.query("SELECT * FROM Orders", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Crear un nuevo pedido
app.post('/orders', (req, res) => {
    const { client_id, total, date, completed, products } = req.body;
    
    db.query("INSERT INTO Orders (id, client_id, total, date, completed) VALUES (?, ?, ?, ?, ?)", 
        [randomUUID(), client_id, total, date, completed], (err, results) => {
        
        if (err) return res.status(500).json({ error: err.message });

        const orderId = results.insertId;

        const productValues = products.map(p => [orderId, p.product_id, p.quantity]);
        db.query("INSERT INTO OrderProducts (order_id, product_id, quantity) VALUES ?", [productValues], (err) => {
            if (err) return res.status(500).json({ error: err.message });

            // Notificar a Firebase que se ha creado un nuevo pedido
            const payload = {
                notification: {
                    title: "Nuevo Pedido",
                    body: `Se ha creado un nuevo pedido con ID ${orderId}`
                }
            };

            admin.messaging().sendToTopic("new_orders", payload)
                .then(() => console.log("Notificación enviada"))
                .catch(error => console.error("Error enviando notificación:", error));

            res.json({ orderId, message: "Pedido creado exitosamente" });
        });
    });
});

// ------------------- SINCRONIZACIÓN -------------------

// Obtener clientes no descargados
app.get('/sync/clients', (req, res) => {
    db.query("SELECT * FROM Clients WHERE downloaded = FALSE", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Marcar clientes como descargados
app.put('/sync/clients/downloaded', (req, res) => {
    const { clientIds } = req.body;
    db.query("UPDATE Clients SET downloaded = TRUE WHERE id IN (?)", [clientIds], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Clientes marcados como descargados" });
    });
});

// Obtener productos no descargados
app.get('/sync/products', (req, res) => {
    db.query("SELECT * FROM Products WHERE downloaded = FALSE", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Marcar productos como descargados
app.put('/sync/products/downloaded', (req, res) => {
    const { productIds } = req.body;
    db.query("UPDATE Products SET downloaded = TRUE WHERE id IN (?)", [productIds], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Productos marcados como descargados" });
    });
});

// Obtener pedidos no descargados
app.get('/sync/orders', (req, res) => {
    db.query("SELECT * FROM Orders WHERE downloaded = FALSE", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.post("/sync/order-products/upload", async (req, res) => {
    const {order_products} = req.body
    const db = await mysql.createConnection(dbConfig);

    for (const product of products) {
        await db.query(
            "INSERT INTO OrderProducts (order_id, product_id, quantity, sended) VALUES (?, ?, ?, ?)",
            [id, product.product_id, product.quantity, true, product.quantity, true]
        );
    }

    res.json({ message: "Pedido sincronizado correctamente" });
});

app.put("/sync/order-products/downloaded", async(req, res) => {
    const { order_products_ids } = req.body

    const query = "UPDATE orderproducts SET downloaded = TRUE where id IN (?)  "

    await db.query(query, [order_products_ids])
})

// Marcar pedidos como descargados
app.put('/sync/orders/downloaded', (req, res) => {
    const { orderIds } = req.body;
    db.query("UPDATE Orders SET downloaded = TRUE WHERE id IN (?)", [orderIds], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Pedidos marcados como descargados" });
    });
});

// Subir clientes desde la app a la base de datos remota
app.post('/sync/clients/upload', (req, res) => {
    const { clients } = req.body;
    
    const clientValues = clients.map(c => [c.name, c.phone]);
    db.query("INSERT INTO Clients (name, phone) VALUES ?", [clientValues], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        res.json({ message: "Clientes subidos exitosamente" });
    });
});

// Subir productos desde la app a la base de datos remota
app.post('/sync/products/upload', (req, res) => {
    const { products } = req.body;
    
    const productValues = products.map(p => [p.name, p.price, p.unit]);
    db.query("INSERT INTO Products (name, price, unit) VALUES ?", [productValues], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        res.json({ message: "Productos subidos exitosamente" });
    });
});

// ------------------- SERVIDOR -------------------
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});