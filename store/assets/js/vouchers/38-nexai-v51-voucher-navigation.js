
(function(){
 'use strict';
 function hideStaleVoucher(){
   var modal=document.getElementById('v38VoucherModal');
   if(!modal||!modal.classList.contains('show'))return;
   var cart=document.querySelector('#product-grid-auto .cart-page');
   var cartVisible=cart && cart.getClientRects().length>0;
   if(cartVisible){
     modal.classList.remove('show');
     modal.setAttribute('aria-hidden','true');
   }
 }
 var original=window.renderCart;
 if(typeof original==='function'&&!original.__nexaiV51){
   var wrapped=function(){hideStaleVoucher();var result=original.apply(this,arguments);hideStaleVoucher();return result};
   wrapped.__nexaiV51=true;
   window.renderCart=wrapped;
 }
})();
