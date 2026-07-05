async function login(){

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  const error = document.getElementById("error");
  const loading = document.getElementById("loading");
  const card = document.getElementById("card");

  error.innerHTML = "";
  loading.style.display = "block";

  try{

    const res = await fetch("/.netlify/functions/login",{
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({username,password})
    });

    const data = await res.json();

    loading.style.display = "none";

    if(data.success){

      localStorage.setItem("token",data.token);
      localStorage.setItem("role",data.role);

      card.classList.add("success");

      setTimeout(()=>{

        if(data.role==="admin"){
          window.location.href="admin-v5/index.html";
        }else{
          window.location.href="vip/"+data.folder+"/index.html";
        }

      },500);

    }else{

      card.classList.add("shake");

      setTimeout(()=>{
        card.classList.remove("shake");
      },300);

      error.innerHTML = data.message || "Login gagal";

    }

  }catch(err){

    loading.style.display = "none";
    error.innerHTML = "Server tidak dapat dihubungi";

  }

}

/* ENTER LOGIN */
document.getElementById("password")
.addEventListener("keydown",function(e){
  if(e.key==="Enter"){
    login();
  }
});