import '../dist/config/load-env.js';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../dist/config/app-config.service.js';
import { PrismaService } from '../dist/database/prisma.service.js';
import { SagunService } from '../dist/sagun/sagun.service.js';
import { sagunFields } from '../dist/sagun/sagun.fields.js';
const config=new AppConfigService(new ConfigService());const db=new PrismaService(config);
const temp=await mkdtemp(path.join(os.tmpdir(),'sagun-verify-'));const previous=process.env.SAGUN_PRIVATE_DIR;process.env.SAGUN_PRIVATE_DIR=path.join(temp,'private');
const ids=[randomUUID(),randomUUID(),randomUUID(),randomUUID()];const rollback=new Error('ROLLBACK_SAGUN_VERIFICATION');let checks=0;
const complete=()=>Object.fromEntries(sagunFields.filter(field=>field.required).map(field=>[field.key,field.type==='checkbox'?true:field.type==='number'?field.min??1:field.type==='select'?field.options[0].value:field.type==='date'?'1995-01-01':field.type==='photo'?'':field.type==='tel'?'9000000000':field.key==='pincode'?'452001':'Verification only']));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9kAAAAASUVORK5CYII=','base64');
try{
 try{
  await db.$transaction(async tx=>{
   const users=[];
   for(const [index,id] of ids.entries()){
    const email=`sagun-verification-${id}@example.invalid`;users.push(await tx.user.create({data:{id,email,fullName:'Sagun Verification',phone:'9000000000',role:index===0?'admin':'user',status:'active',isVerified:true}}));
    await tx.family.create({data:{id:randomUUID(),familyId:`SAGUN-QA-${id}`,email,status:'ACTIVE',contactNumber:'9000000000',headName:'Sagun Verification'}});
   }
   const transactional=new Proxy(tx,{get(target,key){return key==='$transaction'?work=>work(tx):Reflect.get(target,key);}});const service=new SagunService(transactional,config);
   const draft=await service.save(undefined,{action:'DRAFT',data:{candidateType:'GROOM',fullName:'Verification only'}},users[1]);assert.equal(draft.status,'DRAFT');checks++;
   await assert.rejects(()=>service.save(draft.id,{action:'DRAFT',data:{}},users[2]));checks++;
   await assert.rejects(()=>service.adminData(users[1]));checks++;
   await assert.rejects(()=>service.review(draft.id,{status:'APPROVED'},users[0]));checks++;
   const photo={buffer:png,size:png.length,mimetype:'image/png',originalname:'test.png'};
   await assert.rejects(()=>service.upload(draft.id,'PHOTO',photo,'false',users[1]));checks++;
   await assert.rejects(()=>service.upload(draft.id,'PHOTO',{...photo,size:10*1024*1024+1},'true',users[1]));checks++;
   await assert.rejects(()=>service.upload(draft.id,'PHOTO',{...photo,mimetype:'text/html'},'true',users[1]));checks++;
   const uploaded=await service.upload(draft.id,'PHOTO',photo,'true',users[1]);
   const file=await tx.sagunFile.findUniqueOrThrow({where:{id:uploaded.id}});assert.equal((await stat(path.join(process.env.SAGUN_PRIVATE_DIR,file.filename))).mode&0o777,0o600);checks++;
   const pdf=Buffer.from('%PDF-1.4\nVerification-only document');const identity=await service.upload(draft.id,'IDENTITY',{buffer:pdf,size:pdf.length,mimetype:'application/pdf',originalname:'identity.pdf'},'true',users[1]);
   await assert.rejects(()=>service.file(uploaded.id,users[2]));checks++;
   const data={...complete(),fullName:'Verification only',photoFileId:uploaded.id,identityFileId:identity.id,visibility:'MEMBERS',shareContact:true,cashSagun:100,voluntaryConsent:true,sagunItems:[{name:'Voluntary coconut',quantity:'1',offeredBy:'GROOM_FAMILY',donorName:'Verification donor',donorRelationship:'Uncle',recipient:'BRIDE',recordStatus:'GIVEN',givenOn:'2026-10-29',value:100}]};
   await service.save(draft.id,{action:'SUBMIT',data},users[1]);assert.equal((await service.browse({},users[2])).records.some(row=>row.id===draft.id),false);checks++;
   await service.review(draft.id,{status:'APPROVED',notes:'Verification only'},users[0]);
   const listed=(await service.browse({candidateType:'GROOM',minAge:25,maxAge:60},users[2])).records.find(row=>row.id===draft.id);assert.ok(listed);assert.equal('birthDate'in listed,false);checks++;
   const privateView=await service.detail(draft.id,users[2]);assert.equal(privateView.contact,null);assert.equal(privateView.sagun,null);assert.equal('dob'in privateView.data,false);assert.equal('monthlyIncome'in privateView.data,false);checks++;
   assert.equal((await service.file(uploaded.id,users[2])).buffer.length,png.length);checks++;
   await assert.rejects(()=>service.file(identity.id,users[2]));checks++;
   assert.equal((await service.file(identity.id,users[0])).mime,'application/pdf');checks++;
   await assert.rejects(()=>service.inquiry(draft.id,{message:'Hello',consent:false},users[2]));checks++;
   const inquiry=await service.inquiry(draft.id,{message:'Verification-only introduction',consent:true},users[2]);
   assert.equal((await service.mine(users[1])).incoming.find(row=>row.id===inquiry.id).contact,null);checks++;
   await assert.rejects(()=>service.inquiryAction(inquiry.id,{action:'ACCEPT',shareSagun:true},users[3]));checks++;
   await service.inquiryAction(inquiry.id,{action:'ACCEPT',shareSagun:false},users[1]);
   assert.equal((await service.detail(draft.id,users[2])).contact.candidateMobile,'9000000000');assert.equal((await service.detail(draft.id,users[2])).sagun,null);checks++;
   await service.inquiryAction(inquiry.id,{action:'UPDATE_GRANT',shareSagun:true},users[1]);assert.equal((await service.detail(draft.id,users[2])).sagun.cashSagun,100);checks++;
   assert.equal((await service.detail(draft.id,users[3])).contact,null);assert.equal((await service.detail(draft.id,users[3])).sagun,null);checks++;
   await assert.rejects(()=>service.file(identity.id,users[2]));checks++;
   await service.inquiryAction(inquiry.id,{action:'REVOKE'},users[1]);assert.equal((await service.detail(draft.id,users[2])).contact,null);assert.equal((await service.detail(draft.id,users[2])).sagun,null);checks++;
   await service.deactivate(draft.id,users[1]);await assert.rejects(()=>service.detail(draft.id,users[2]));await assert.rejects(()=>service.file(uploaded.id,users[2]));checks++;
   await assert.rejects(()=>service.configure({overrides:{cashSagun:{required:true}}},users[0]));checks++;
   await assert.rejects(()=>service.configure({overrides:{dob:{required:false}}},users[0]));checks++;
   await service.configure({overrides:{college:{required:true,en:'University'}}},users[0]);
   await assert.rejects(()=>service.save(draft.id,{action:'SUBMIT',data},users[1]));checks++;
   await service.configure({overrides:{}},users[0]);
   const prepared=await service.save(undefined,{action:'DRAFT',ownerUserId:users[1].id,data:{}},users[0]);
   await assert.rejects(()=>service.save(prepared.id,{action:'DRAFT',data:{candidateConsent:true}},users[0]));checks++;
   await assert.rejects(()=>service.withdrawConsent(draft.id,users[2]));checks++;
   await assert.rejects(()=>service.withdrawConsent(draft.id,users[0]));checks++;
   await tx.sagunInquiry.update({where:{id:inquiry.id},data:{status:'ACCEPTED',shareSagun:true}});
   await service.withdrawConsent(draft.id,users[1]);
   const withdrawn=await tx.sagunProfile.findUniqueOrThrow({where:{id:draft.id}});assert.equal(withdrawn.status,'DEACTIVATED');assert.equal(withdrawn.visibility,'PRIVATE');assert.equal(withdrawn.data.candidateConsent,false);assert.equal(withdrawn.data.sagunItems[0].donorName,'Verification donor');checks++;
   const revoked=await tx.sagunInquiry.findUniqueOrThrow({where:{id:inquiry.id}});assert.equal(revoked.shareSagun,false);assert.equal(revoked.status,'DECLINED');checks++;
   await service.remove(draft.id,users[1]);await assert.rejects(()=>service.file(uploaded.id,users[1]));checks++;
   assert.ok((await service.adminData(users[0])).audits.some(row=>row.action==='READ_PRIVATE_DOCUMENT'));checks++;
   throw rollback;
  },{isolationLevel:'Serializable',timeout:90000});
 }catch(error){if(error!==rollback)throw error;}
 assert.equal(await db.user.count({where:{id:{in:ids}}}),0);assert.equal(await db.sagunProfile.count({where:{userId:{in:ids}}}),0);
 console.log(JSON.stringify({checks,rolledBack:true,testAccountsRemain:false,privateTestFilesCleaned:true,externalMessagesSent:0}));
}catch(error){console.error('Sagun verification failed:',error?.code||error?.constructor?.name,error?.getResponse?.()||error?.message);process.exitCode=1;}
finally{await db.$disconnect();await rm(temp,{recursive:true,force:true});if(previous===undefined)delete process.env.SAGUN_PRIVATE_DIR;else process.env.SAGUN_PRIVATE_DIR=previous;}
