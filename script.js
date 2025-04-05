const API_URL = "http://localhost:3000"; // Reemplázalo con tu API en producción

document.addEventListener("DOMContentLoaded", () => {
    loadClients();
    loadProducts();
});

// Cargar clientes desde la API
function loadClients() {
    fetch(`${API_URL}/clients`)
        .then(response => response.json())
        .then(clients => {
            const clientSelect = document.getElementById("client");
            clientSelect.innerHTML = '<option value="">Selecciona un cliente</option>';
            clients.forEach(client => {
                let option = document.createElement("option");
                option.value = client.id;
                option.textContent = client.name;
                clientSelect.appendChild(option);
            });
        })
        .catch(error => console.error("Error cargando clientes:", error));
}

// Cargar productos desde la API
function loadProducts() {
    fetch(`${API_URL}/products`)
        .then(response => response.json())
        .then(products => {
            const container = document.getElementById("products-container");
            container.innerHTML = "";

            products.forEach(product => {
                const productDiv = document.createElement("div");
                productDiv.classList.add("product-item");

                productDiv.innerHTML = `
                    <span>${product.name} - $${product.price}</span>
                    <input type="number" id="product-${product.id}" min="0" value="0">
                `;
                container.appendChild(productDiv);
            });
        })
        .catch(error => console.error("Error cargando productos:", error));
}

// Enviar pedido a la API
document.getElementById("submit-order").addEventListener("click", () => {
    const clientId = document.getElementById("client").value;
    if (!clientId) {
        alert("Selecciona un cliente.");
        return;
    }

    const productInputs = document.querySelectorAll("[id^='product-']");
    const products = [];
    let total = 0;

    productInputs.forEach(input => {
        const productId = input.id.split("-")[1];
        const quantity = parseInt(input.value);
        if (quantity > 0) {
            products.push({ product_id: parseInt(productId), quantity });
            total += quantity * parseFloat(input.dataset.price);
        }
    });

    if (products.length === 0) {
        alert("Selecciona al menos un producto.");
        return;
    }

    const order = {
        client_id: parseInt(clientId),
        total,
        date: Date.now(),
        completed: false,
        products
    };

    fetch(`${API_URL}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(order)
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById("message").textContent = "Pedido realizado con éxito.";
        console.log("Pedido creado:", data);
    })
    .catch(error => {
        document.getElementById("message").textContent = "Error al realizar el pedido.";
        console.error("Error:", error);
    });
});
