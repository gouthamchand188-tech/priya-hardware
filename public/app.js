let products = [];
let cart = JSON.parse(localStorage.getItem("phcart") || "[]");
let category = "";

const money = n => "₹" + Number(n).toLocaleString("en-IN");

async function load() {
  const q = document.getElementById("q").value;

  try {
    const response = await fetch(
      `/api/products?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`
    );

    products = await response.json();
    render();
  } catch (error) {
    document.getElementById("status").textContent =
      "Unable to load products.";
  }
}

function setCat(c) {
  category = c;
  load();
}

function render() {
  const status = document.getElementById("status");
  const grid = document.getElementById("grid");

  status.textContent = `${products.length} products shown`;

  grid.innerHTML = products.map(p => `
    <article class="card product-card" onclick="openProduct(${p.id})">

      <div class="pic">
        ${
          p.image
            ? '<img src="' + p.image + '" alt="' + p.name + '">'
            : "📦"
        }
      </div>

      <h3>${p.name}</h3>

      <small>
        ${p.category} · ${p.brand || "Priya Hardware"}
      </small>

      <div class="price">
        ${money(p.price)}
      </div>

      <button
        class="add"
        onclick="event.stopPropagation(); add(${p.id})">
        Add to Cart
      </button>

      <button
        class="add"
        onclick="event.stopPropagation(); openProduct(${p.id})">
        View Details
      </button>

    </article>
  `).join("");
}

function openProduct(id) {
  window.location.href =
    "product-details.html?id=" + encodeURIComponent(id);
}

function add(id) {
  const product = products.find(p => p.id === id);

  if (!product) return;

  const existing = cart.find(item => item.id === id);

  if (existing) {
    existing.qty++;
  } else {
    cart.push({
      id: id,
      qty: 1
    });
  }

  save();
  openCart();
}

function save() {
  localStorage.setItem("phcart", JSON.stringify(cart));

  document.getElementById("count").textContent =
    cart.reduce((total, item) => total + item.qty, 0);
}

function openCart() {
  document.getElementById("cart").classList.add("show");
  cartEl();
}

function closeCart() {
  document.getElementById("cart").classList.remove("show");
}

function cartEl() {
  const cartList = document.getElementById("cartList");
  const totalElement = document.getElementById("total");

  let total = 0;

  if (!cart.length) {
    cartList.innerHTML = "<p>Your cart is empty.</p>";
    totalElement.textContent = money(0);
    return;
  }

  cartList.innerHTML = cart.map(item => {
    const product = products.find(p => p.id === item.id);

    if (!product) return "";

    total += product.price * item.qty;

    return `
      <div class="cartrow">

        <div class="pic">
          ${
            product.image
              ? '<img src="' + product.image + '" alt="' + product.name + '">'
              : "📦"
          }
        </div>

        <div>
          <b>${product.name}</b>
          <br>
          ${money(product.price)} × ${item.qty}
        </div>

        <div>
          <button onclick="chg(${product.id}, -1)">−</button>
          ${item.qty}
          <button onclick="chg(${product.id}, 1)">+</button>
        </div>

      </div>
    `;
  }).join("");

  totalElement.textContent = money(total);
}

function chg(id, change) {
  const item = cart.find(x => x.id === id);

  if (!item) return;

  item.qty += change;

  if (item.qty < 1) {
    cart = cart.filter(x => x.id !== id);
  }

  save();
  cartEl();
}

function checkout() {
  if (!cart.length) {
    alert("Your cart is empty");
    return;
  }

  closeCart();

  document.getElementById("checkout").classList.add("show");
}

function closeCheckout() {
  document.getElementById("checkout").classList.remove("show");
}

async function placeOrder(event) {
  event.preventDefault();

  const name = document.getElementById("name").value;
  const phone = document.getElementById("phone").value;
  const email = document.getElementById("email").value;
  const address = document.getElementById("address").value;
  const pay = document.getElementById("pay").value;

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        customer_name: name,
        phone: phone,
        email: email,
        address: address,
        payment_method: pay,
        items: cart
      })
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error || "Unable to place order");
      return;
    }

    alert(
      `Order ${data.order_no} created.\nTotal ${money(data.total)}.`
    );

    cart = [];
    save();
    closeCheckout();

  } catch (error) {
    alert("Something went wrong. Please try again.");
  }
}

save();
load();
function openTracker() {
  document.getElementById("tracker").classList.add("show");
  document.getElementById("trackingResult").innerHTML = "";
}

function closeTracker() {
  document.getElementById("tracker").classList.remove("show");
}

function statusText(status) {
  const names = {
    NEW: "Order Placed",
    CONFIRMED: "Confirmed",
    PROCESSING: "Processing",
    SHIPPED: "Dispatched",
    DELIVERED: "Delivered"
  };

  return names[status] || status;
}

function trackingHtml(status) {
  const steps = [
    "NEW",
    "CONFIRMED",
    "PROCESSING",
    "SHIPPED",
    "DELIVERED"
  ];

  const current = steps.indexOf(status);

  return `
    <div class="tracking-steps">
      ${steps.map((step, i) => `
        <div class="tracking-step ${i <= current ? "done" : ""}">
          <span>${i <= current ? "✓" : "○"}</span>
          <b>${statusText(step)}</b>
        </div>
      `).join("")}
    </div>
  `;
}

async function trackOrder() {
  const orderNo = document.getElementById("trackOrderNo").value.trim();
  const phone = document.getElementById("trackPhone").value.trim();
  const result = document.getElementById("trackingResult");

  if (!orderNo || !phone) {
    result.innerHTML = "<p>Please enter order number and phone number.</p>";
    return;
  }

  result.innerHTML = "<p>Checking order...</p>";

  try {
    const response = await fetch(
      "/api/track-order?order_no=" +
      encodeURIComponent(orderNo) +
      "&phone=" +
      encodeURIComponent(phone)
    );

    const data = await response.json();

    if (!response.ok) {
      result.innerHTML =
        "<p>❌ " + (data.error || "Order not found.") + "</p>";
      return;
    }

    result.innerHTML = `
      <div class="tracking-result">
        <h3>Order #${data.order_no}</h3>
        <p>Total: <b>₹${data.total}</b></p>
        <p>Current Status: <b>${statusText(data.order_status)}</b></p>

        ${trackingHtml(data.order_status)}
      </div>
    `;
  } catch (error) {
    result.innerHTML =
      "<p>Unable to check the order right now.</p>";
  }
}
