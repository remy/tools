// The two long-press edit dialogs: an exercise, and a workout's cardio block.

import { state } from './state.js';
import { persistPlan } from './plan.js';
import { reRenderPreservingTab } from './render.js';

/* ── Edit-exercise dialog ── */
let editTarget = null; // { workoutIndex, exerciseIndex }

export function openEditDialog(row) {
  const workoutIndex = parseInt(row.dataset.workoutIndex, 10);
  const exerciseIndex = parseInt(row.dataset.exerciseIndex, 10);
  const workout = state.plan?.workouts?.[workoutIndex];
  const exercise = workout?.exercises?.[exerciseIndex];
  if (!exercise) return;

  editTarget = { workoutIndex, exerciseIndex };

  const dialog = document.getElementById('edit-exercise-dialog');
  const isCircuit = workout.type === 'circuit';
  dialog.querySelector('#edit-ex-name').value = exercise.name || '';
  dialog.querySelector('#edit-ex-sets').value = exercise.sets || '';
  dialog.querySelector('#edit-ex-reps').value = exercise.reps || '';
  dialog.querySelector('#edit-sets-reps-row').hidden = isCircuit;

  const total = workout.exercises.length;
  const positionSelect = dialog.querySelector('#edit-ex-position');
  positionSelect.innerHTML = Array.from({ length: total }, (_, i) =>
    `<option value="${i}">${i + 1} of ${total}</option>`
  ).join('');
  positionSelect.value = exerciseIndex;

  dialog.showModal();
}

function closeEditDialog() {
  document.getElementById('edit-exercise-dialog').close();
  editTarget = null;
}

async function saveEditedExercise() {
  if (!editTarget) return;
  const { workoutIndex, exerciseIndex } = editTarget;
  const workout = state.plan.workouts[workoutIndex];
  const exercise = workout?.exercises?.[exerciseIndex];
  if (!exercise) return;

  const dialog = document.getElementById('edit-exercise-dialog');
  const name = dialog.querySelector('#edit-ex-name').value.trim();
  if (!name) return;
  exercise.name = name;

  if (workout.type !== 'circuit') {
    exercise.sets = dialog.querySelector('#edit-ex-sets').value.trim();
    exercise.reps = dialog.querySelector('#edit-ex-reps').value.trim();
  }

  const newIndex = parseInt(dialog.querySelector('#edit-ex-position').value, 10);
  if (!Number.isNaN(newIndex) && newIndex !== exerciseIndex) {
    workout.exercises.splice(exerciseIndex, 1);
    workout.exercises.splice(newIndex, 0, exercise);
  }

  editTarget = null;
  dialog.close();
  await persistPlan();
  reRenderPreservingTab();
}

async function deleteEditedExercise() {
  if (!editTarget) return;
  const { workoutIndex, exerciseIndex } = editTarget;
  state.plan.workouts[workoutIndex].exercises.splice(exerciseIndex, 1);
  editTarget = null;
  closeEditDialog();
  await persistPlan();
  reRenderPreservingTab();
}

/* ── Edit-cardio dialog ── */
let cardioEditTarget = null; // { workoutIndex }

export function openCardioDialog(block) {
  const workoutIndex = parseInt(block.dataset.workoutIndex, 10);
  const workout = state.plan?.workouts?.[workoutIndex];
  const cardio = workout?.cardio;
  if (!cardio) return;

  cardioEditTarget = { workoutIndex };

  const dialog = document.getElementById('edit-cardio-dialog');
  dialog.querySelector('#edit-cardio-icon').value = cardio.icon || '';
  dialog.querySelector('#edit-cardio-title').value = cardio.title || '';
  dialog.querySelector('#edit-cardio-description').value = cardio.description || '';

  dialog.showModal();
}

function closeCardioDialog() {
  document.getElementById('edit-cardio-dialog').close();
  cardioEditTarget = null;
}

async function saveEditedCardio() {
  if (!cardioEditTarget) return;
  const { workoutIndex } = cardioEditTarget;
  const cardio = state.plan.workouts[workoutIndex]?.cardio;
  if (!cardio) return;

  const dialog = document.getElementById('edit-cardio-dialog');
  const title = dialog.querySelector('#edit-cardio-title').value.trim();
  const description = dialog.querySelector('#edit-cardio-description').value.trim();
  if (!title || !description) return;
  cardio.icon = dialog.querySelector('#edit-cardio-icon').value.trim();
  cardio.title = title;
  cardio.description = description;

  cardioEditTarget = null;
  dialog.close();
  await persistPlan();
  reRenderPreservingTab();
}

async function deleteEditedCardio() {
  if (!cardioEditTarget) return;
  const { workoutIndex } = cardioEditTarget;
  delete state.plan.workouts[workoutIndex].cardio;
  cardioEditTarget = null;
  closeCardioDialog();
  await persistPlan();
  reRenderPreservingTab();
}

export function bindDialogs() {
  const editDialog = document.getElementById('edit-exercise-dialog');
  editDialog.addEventListener('click', (e) => {
    if (e.target === editDialog) editDialog.close();
  });
  editDialog.querySelector('.edit-exercise-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveEditedExercise();
  });
  document.getElementById('edit-ex-cancel').addEventListener('click', closeEditDialog);
  document.getElementById('edit-ex-delete').addEventListener('click', deleteEditedExercise);

  const cardioDialog = document.getElementById('edit-cardio-dialog');
  cardioDialog.addEventListener('click', (e) => {
    if (e.target === cardioDialog) cardioDialog.close();
  });
  cardioDialog.querySelector('.edit-exercise-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveEditedCardio();
  });
  document.getElementById('edit-cardio-cancel').addEventListener('click', closeCardioDialog);
  document.getElementById('edit-cardio-delete').addEventListener('click', deleteEditedCardio);
}
