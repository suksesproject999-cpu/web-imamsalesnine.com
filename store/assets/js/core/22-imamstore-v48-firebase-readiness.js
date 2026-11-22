(()=>{'use strict';
const state={sdk:!!window.firebase,initialized:false,firestore:false,catalog:false,checkedAt:null};
function check(){state.sdk=!!window.firebase;state.initialized=!!(window.firebase?.apps?.length);state.firestore=!!(state.initialized&&typeof firebase.firestore==='function');state.catalog=!!(document.querySelector('[data-product-id]'));state.checkedAt=new Date().toISOString();return {...state}}
window.imamstoreFirebaseStatus=check;
window.addEventListener('load',check,{once:true});
})();