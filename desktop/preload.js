'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * The isolated boundary between the sandboxed renderer and the main process.
 *
 * The renderer gets these functions and nothing else: no database handle, no
 * filesystem path, no Supabase client, no `require`. Main owns all of them.
 * That is what keeps the service-role key off lab machines and stops a student
 * reading another student's data through devtools.
 *
 * Every method is a one-line pass-through on purpose. Any logic added here runs
 * with the preload's privileges but is reachable from page script, so decisions
 * — signature verification, authorisation, clock handling — belong in main.
 *
 * Contract and types: desktop/renderer/src/tereco-bridge.d.ts
 */
contextBridge.exposeInMainWorld('tereco', {
  device: () => ipcRenderer.invoke('tereco:device'),

  // Online preparation. The only calls that touch the network, and they run in
  // the main process so no credential or cookie is ever reachable from the page.
  signIn: (credentials) => ipcRenderer.invoke('tereco:signIn', credentials),
  signOut: () => ipcRenderer.invoke('tereco:signOut'),
  currentUser: () => ipcRenderer.invoke('tereco:currentUser'),
  availableAssessments: () => ipcRenderer.invoke('tereco:availableAssessments'),
  prepare: (assessmentSystemId) => ipcRenderer.invoke('tereco:prepare', assessmentSystemId),

  getPackage: (assessmentId) => ipcRenderer.invoke('tereco:getPackage', assessmentId),
  getQuestions: (assessmentId) => ipcRenderer.invoke('tereco:getQuestions', assessmentId),
  listPrepared: () => ipcRenderer.invoke('tereco:listPrepared'),

  getAttempt: (assessmentId) => ipcRenderer.invoke('tereco:getAttempt', assessmentId),
  saveAnswer: (attemptId, questionId, value) =>
    ipcRenderer.invoke('tereco:saveAnswer', attemptId, questionId, value),
  saveIndex: (attemptId, currentIndex) =>
    ipcRenderer.invoke('tereco:saveIndex', attemptId, currentIndex),
  submit: (attemptId) => ipcRenderer.invoke('tereco:submit', attemptId),

  syncStatus: () => ipcRenderer.invoke('tereco:syncStatus'),
  retrySync: () => ipcRenderer.invoke('tereco:retrySync'),

  // Auto-update. onUpdateReady never fires outside a packaged install; main
  // only registers the 'tereco:update-ready' sender and the installUpdate
  // handler once it has actually started the updater.
  onUpdateReady: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('tereco:update-ready', listener);
    return () => ipcRenderer.removeListener('tereco:update-ready', listener);
  },
  installUpdate: () => ipcRenderer.invoke('tereco:installUpdate'),
});
