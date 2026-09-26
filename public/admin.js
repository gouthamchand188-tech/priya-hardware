const money=n=>"₹"+Number(n).toLocaleString("en-IN");

async function stats(){
  let d=await(await fetch("/api/stats")).json();
  pc.textContent=d.products;
  sc.textContent=d.stock;
  oc.textContent=d.orders;
  sales.textContent=money(d.sales);
}

async function load(){
  let a=await(await fetch("/api/products")).json();

  rows.innerHTML=
    "<tr><th>ID</th><th>SKU</th><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Action</th></tr>"+
    a.map(p=>`
      <tr>
        <td>${p.id}</td>
        <td>${p.sku}</td>
        <td>${p.name}</td>
        <td>${p.category}</td>
        <td>${money(p.price)}</td>
        <td>${p.stock}</td>
        <td><button onclick="editProduct(${p.id})">Edit</button></td>
      </tr>
    `).join("");

  stats();
}

async function editProduct(id){
  let a=await(await fetch("/api/products")).json();
  let p=a.find(x=>x.id===id);

  if(!p)return alert("Product not found");

  let name=prompt("Product name:",p.name);
  if(name===null)return;

  let category=prompt("Category:",p.category);
  if(category===null)return;

  let brand=prompt("Brand:",p.brand||"");
  if(brand===null)return;

  let price=prompt("Price:",p.price);
  if(price===null)return;

  let mrp=prompt("MRP:",p.mrp||0);
  if(mrp===null)return;

  let stock=prompt("Stock:",p.stock);
  if(stock===null)return;

  let image=prompt("Image URL:",p.image||"");
  if(image===null)return;

  let r=await fetch("/api/products/"+id,{
    method:"PUT",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      sku:p.sku,
      name,
      category,
      brand,
      price,
      mrp,
      stock,
      description:p.description||"",
      image
    })
  });

  let d=await r.json();

  if(!r.ok)return alert(d.error||"Update failed");

  alert("Product updated successfully!");
  load();
}

pf.onsubmit=async e=>{
  e.preventDefault();

  let o=Object.fromEntries(new FormData(pf));

  let r=await fetch("/api/products",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(o)
  });

  let d=await r.json();

  if(!r.ok)return alert(d.error);

  pf.reset();
  load();
};

async function orders(){
  let a=await(await fetch("/api/orders")).json();

  orows.innerHTML=
    "<tr><th>Order</th><th>Customer</th><th>Phone</th><th>Total</th><th>Payment</th><th>Status</th></tr>"+
    a.map(o=>`
      <tr>
        <td>${o.order_no}</td>
        <td>${o.customer_name}</td>
        <td>${o.phone}</td>
        <td>${money(o.total)}</td>
        <td>${o.payment_method}</td>
        <td>${o.order_status}</td>
      </tr>
    `).join("");
}

load();
orders();
