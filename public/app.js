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
    <article class="card">
      <div class="pic">${p.image ? '<img src="' + p.image + '" alt="' + p.name + '">' : "📦"}</div>

      <h3>${p.name}</h3>

      <small>
        ${p.category} · ${p.brand || "Priya Hardware"}
      </small>

      <div class="price">
        ${money(p.price)}
      </div>

      <button class="add" onclick="add(${p.id})">
        Add to Cart
      </button>
      <button class="add" onclick="showDetails(${p.id})">
  View Details
</button>
    </article>
  `).join("");
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
          ${product.image || "📦"}
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
