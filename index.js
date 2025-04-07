require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');

// Inicializar Firebase
const serviceAccount = require("./firebase/appcorte3-53239-firebase-adminsdk-fbsvc-a12fd4f61a.json");
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
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// Crear un nuevo cliente
app.post('/clients', (req, res) => {
    const { id, name, phone } = req.body;
    db.query("INSERT INTO Clients (id, name, phone) VALUES (?, ?, ?)", [id, name, phone], (err, results) => {
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
    const { id, name, price, unit } = req.body;
    db.query("INSERT INTO Products (id, name, price, unit) VALUES (?, ?, ?, ?)", [id, name, price, unit], (err, results) => {
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
    const { client_id, total, date, products } = req.body;
    const orderId = randomUUID()
    db.query("INSERT INTO Orders (id, client_id, total, date, completed, sended) VALUES (?, ?, ?, ?, ?, ?)", 
        [orderId, client_id, total, date, 0, 0], (err, results) => {
        
        if (err) return res.status(500).json({ error: err.message });


        const productValues = products.map(p => [randomUUID(), orderId, p.product_id, p.quantity, 0]);
        db.query("INSERT INTO OrderProducts (id, order_id, product_id, quantity, sended) VALUES ?", [productValues], (err) => {
            if (err) return res.status(500).json({ error: err.message });

            // Notificar a Firebase que se ha creado un nuevo pedido
            const payload = {
                notification: {
                    title: "Nuevo Pedido",
                    body: `Se ha creado un nuevo pedido con ID ${orderId}`
                },
                topic: "new_orders"
            };

            console.log(admin)
            admin.messaging().send(payload)
                .then(() => console.log("Notificación enviada"))
                .catch(error => console.error("Error enviando notificación:", error));

            res.json({ orderId, message: "Pedido creado exitosamente" });
        });
    });
});

app.post('/orders-products', (req, res) => {
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
            
            // admin.messaging().sendToTopic("new_orders", payload)
            //     .then(() => console.log("Notificación enviada"))
            //     .catch(error => console.error("Error enviando notificación:", error));

            res.json({ orderId, message: "Pedido creado exitosamente" });
        });
    });
});

// ------------------- SINCRONIZACIÓN -------------------

// Obtener clientes no descargados
app.get('/sync/clients', (req, res) => {
    db.query("SELECT * FROM Clients WHERE sended = FALSE", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Marcar clientes como descargados
app.put('/sync/clients/downloaded', (req, res) => {
    const { clientIds } = req.body;
    db.query("UPDATE Clients SET sended = TRUE WHERE id IN (?)", [clientIds], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Clientes marcados como descargados" });
    });
});

// Obtener productos no descargados
app.get('/sync/products', (req, res) => {
    db.query("SELECT * FROM Products WHERE sended = FALSE", (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Marcar productos como descargados
app.put('/sync/products/:id', (req, res) => {
    const { id } = req.params;
    db.query("UPDATE Products SET sended = TRUE WHERE id = (?)", [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Productos marcados como descargados" });
    });
});

app.post('/sync/orders', (req, res) => {
    const {id, client_id, total, date, completed} = req.body
    db.query("INSERT INTO Orders (id, client_id, total, date, completed, sended) values (?, ?, ?, ?, ?, ?)", [id, client_id, total, date, completed, true], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Obtener pedidos no descargados
app.get('/sync/orders', (req, res) => {
    db.query("SELECT * FROM Orders WHERE sended = 0", (err, results) => {

        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Marcar pedidos como descargados
app.put('/sync/orders/:id', (req, res) => {
    const { id } = req.params;
    db.query("UPDATE Orders SET sended = 1 WHERE id = (?)", [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Pedidos marcados como descargados" });
    });
});

app.get('/sync/order-products/', (req, res) => {
    const {id} = req.params
    db.query("SELECT * FROM OrderProducts WHERE sended = 0", (err, results) => {

        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.post("/sync/order-products", async (req, res) => {
    const {id, order_id, product_id, quantity} = req.body

    await db.query(
        "INSERT INTO OrderProducts (id, order_id, product_id, quantity, sended) VALUES (?, ?, ?, ?, ?)",
        [id, order_id, product_id, quantity, true]
    );


    res.json({ message: "Pedido subido correctamente" });
});

app.put("/sync/order-products/:id", async(req, res) => {
    const { id } = req.params

    const query = "UPDATE OrderProducts SET sended = TRUE where id = ?  "

    await db.query(query, [id])

    res.json({ message: "Pedido sincronizado correctamente" });

})


// ------------------- SERVIDOR -------------------
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});