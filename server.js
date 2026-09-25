const express=require("express"),path=require("path"),crypto=require("crypto"),Database=require("better-sqlite3");
const app=express(),db=new Database("priya_hardware.db"),PORT=process.env.PORT||3000;

const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||"";
const adminSessions=new Set();

db.exec(`CREATE TABLE IF NOT EXISTS products(
id INTEGER PRIMARY KEY AUTOINCREMENT,sku TEXT UNIQUE,name TEXT NOT NULL,
category TEXT NOT NULL,brand TEXT,price REAL NOT NULL,mrp REAL,
stock INTEGER DEFAULT 0,description TEXT,image TEXT,active INTEGER DEFAULT 1);

CREATE TABLE IF NOT EXISTS orders(
id INTEGER PRIMARY KEY AUTOINCREMENT,order_no TEXT UNIQUE,customer_name TEXT,
phone TEXT,email TEXT,address TEXT,payment_method TEXT,total REAL,
items_json TEXT,order_status TEXT DEFAULT 'NEW',
payment_status TEXT DEFAULT 'PENDING',created_at TEXT);`);

const seed=[
["PH-PAINT-001","Asian Paints Apex 1L","Paints","Asian Paints",395,395,0,"Asian Paints Apex exterior paint, 1 litre","🎨"],
["PH-PIPE-001","PVC Pipe 1/2 inch - Heavy","Pipes","",75,75,0,"Heavy PVC pipe, 1/2 inch","◯"],
["PH-FIT-001","PVC Elbow 1/2 inch","Fittings","",10,10,0,"PVC elbow fitting, 1/2 inch","🔩"],
["PH-ELEC-001","Havells Switch","Electrical","Havells",20,20,0,"Havells electrical switch","💡"],
["PH-ELEC-002","Anchor 6A Socket","Electrical","Anchor",65,65,0,"Anchor 6 amp socket","🔌"],
["PH-PIPE-002","GI Pipe 1 inch","Pipes","",89,89,0,"GI pipe, priced per foot","◯"],
["PH-PLUMB-001","PVC Solvent 100ml","Plumbing","",70,70,0,"PVC solvent cement, 100ml","🧴"],
["PH-HARD-001","Door Lock 65mm","Hardware","",130,130,0,"Door lock, 65mm","🔒"],
["PH-HARD-002","Screw 1 inch","Hardware","",1,1,0,"Screw, 1 inch","🔩"],
["PH-PAINT-002","Wall Putty 40kg","Paints","",890,890,0,"Wall putty, 40kg bag","🎨"]
];

const ins=db.prepare("INSERT OR IGNORE INTO products(sku,name,category,brand,price,mrp,stock,description,image) VALUES(?,?,?,?,?,?,?,?,?)");
seed.forEach(x=>ins.run(...x));

app.use(express.json({limit:"2mb"}));

function getAdminToken(req){
  const m=(req.headers.cookie||"").match(/(?:^|; )ph_admin=([^;]+)/);
  return m?decodeURIComponent(m[1]):"";
}

function isAdmin(req){
  const token=getAdminToken(req);
  return !!token&&adminSessions.has(token);
}

function requireAdmin(req,res,next){
  if(!isAdmin(req)) return res.status(401).json({error:"Admin login required"});
  next();
}

app.post("/api/admin/login",(req,res)=>{
  if(!ADMIN_PASSWORD)
    return res.status(503).json({error:"Admin password is not configured on the server."});

  if(String(req.body?.password||"")!==ADMIN_PASSWORD)
    return res.status(401).json({error:"Incorrect admin password"});

  const token=crypto.randomBytes(32).toString("hex");
  adminSessions.add(token);

  res.setHeader(
    "Set-Cookie",
    `ph_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
  );

  res.json({ok:true});
});

app.post("/api/admin/logout",(req,res)=>{
  const token=getAdminToken(req);
  if(token) adminSessions.delete(token);

  res.setHeader(
    "Set-Cookie",
    "ph_admin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
  );

  res.json({ok:true});
});

app.get("/api/admin/session",(req,res)=>{
  res.json({admin:isAdmin(req)});
});

app.get("/admin.html",(req,res)=>{
  if(!isAdmin(req)) return res.redirect("/admin-login.html");
  res.sendFile(path.join(__dirname,"public","admin.html"));
});

app.use(express.static(path.join(__dirname,"public")));

app.get("/api/products",(q,s)=>{
  let sql="SELECT * FROM products WHERE active=1";
  let a=[];
  let term=(q.query.q||"").trim();
  let cat=(q.query.category||"").trim();

  if(term){
    sql+=" AND (name LIKE ? OR sku LIKE ? OR brand LIKE ? OR category LIKE ?)";
    let x="%"+term+"%";
    a.push(x,x,x,x);
  }

  if(cat){
    sql+=" AND category=?";
    a.push(cat);
  }

  sql+=" ORDER BY id DESC LIMIT 500";
  s.json(db.prepare(sql).all(...a));
});

app.post("/api/products",requireAdmin,(q,s)=>{
  let p=q.body;

  if(!p.name||!p.category)
    return s.status(400).json({error:"Name and category required"});

  try{
    let r=db.prepare(
      "INSERT INTO products(sku,name,category,brand,price,mrp,stock,description,image) VALUES(?,?,?,?,?,?,?,?,?)"
    ).run(
      p.sku||"PH-"+Date.now(),
      p.name,
      p.category,
      p.brand||"",
      +p.price||0,
      +p.mrp||0,
      +p.stock||0,
      p.description||"",
      p.image||""
    );

    s.json({id:r.lastInsertRowid});
  }catch(e){
    s.status(400).json({error:e.message});
  }
});

app.delete("/api/products/:id",requireAdmin,(q,s)=>{
  db.prepare("UPDATE products SET active=0 WHERE id=?").run(q.params.id);
  s.json({ok:true});
});

app.post("/api/orders",(q,s)=>{
  let {customer_name,phone,email,address,payment_method,items}=q.body;

  if(!customer_name||!phone||!address||!items?.length)
    return s.status(400).json({error:"Complete checkout details required"});

  let total=0,norm=[];

  try{
    let no;

    db.transaction(()=>{
      for(let x of items){
        let p=db.prepare(
          "SELECT * FROM products WHERE id=? AND active=1"
        ).get(x.id);

        if(!p) throw Error("Product unavailable");

        let qty=Math.max(1,+x.qty||1);

        if(p.stock<qty)
          throw Error(p.name+" is out of stock");

        total+=p.price*qty;

        norm.push({
          id:p.id,
          name:p.name,
          qty,
          price:p.price
        });

        db.prepare(
          "UPDATE products SET stock=stock-? WHERE id=?"
        ).run(qty,p.id);
      }

      no="PH"+Date.now().toString().slice(-10);

      db.prepare(
        "INSERT INTO orders(order_no,customer_name,phone,email,address,payment_method,total,items_json,created_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'))"
      ).run(
        no,
        customer_name,
        phone,
        email||"",
        address,
        payment_method,
        total,
        JSON.stringify(norm)
      );
    })();

    s.json({ok:true,order_no:no,total});
  }catch(e){
    s.status(400).json({error:e.message});
  }
});

app.get("/api/orders",requireAdmin,(q,s)=>{
  s.json(
    db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 500").all()
  );
});

app.get("/api/stats",requireAdmin,(q,s)=>{
  s.json({
    products:db.prepare("SELECT count(*) c FROM products WHERE active=1").get().c,
    stock:db.prepare("SELECT coalesce(sum(stock),0) s FROM products WHERE active=1").get().s,
    orders:db.prepare("SELECT count(*) c FROM orders").get().c,
    sales:db.prepare("SELECT coalesce(sum(total),0) s FROM orders").get().s
  });
});

app.listen(PORT,()=>console.log("Priya Hardware: http://localhost:"+PORT));
