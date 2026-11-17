import {cert,getApps,initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';

let services;
export function getPresenceFirebase(){
  if(services)return services;
  const projectId=process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail=process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey=process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,'\n');
  if(!projectId||!clientEmail||!privateKey){
    throw new Error('PRESENCE_FIREBASE_CONFIG_MISSING');
  }
  const existing=getApps().find(app=>app.name==='imamstore-presence');
  const app=existing||initializeApp({
    credential:cert({projectId,clientEmail,privateKey}),
    projectId
  },'imamstore-presence');
  services={auth:getAuth(app),db:getFirestore(app)};
  return services;
}
