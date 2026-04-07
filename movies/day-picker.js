import { formatDayLabel, escapeHtml } from './utils.js';

export class DayPicker extends HTMLElement {
  connectedCallback() {
    this.render();
  }

  setData(days, selectedDay) {
    this.days = days;
    this.selectedDay = selectedDay || '';
    this.render();
  }

  render() {
    const days = this.days || [];
    const selected = this.selectedDay || '';

    this.innerHTML = `
      <label class="field" for="day-select">
        <span class="field-label">Pick day</span>
        <select id="day-select" class="select">
          <option value="next-7-days" ${selected === 'next-7-days' || selected === '' ? 'selected' : ''}>Next 7 days</option>
          <option value="next-14-days" ${selected === 'next-14-days' ? 'selected' : ''}>Next 2 weeks</option>
          <option disabled>────────────────────</option>
          ${days
        .map((day) => {
          const optionLabel = formatDayLabel(day);
          const isSelected = selected === day ? 'selected' : '';
          return `<option value="${escapeHtml(day)}" ${isSelected}>${escapeHtml(optionLabel)}</option>`;
        })
        .join('')}
        </select>
      </label>
    `;

    const selectEl = this.querySelector('#day-select');
    selectEl?.addEventListener('change', (event) => {
      this.dispatchEvent(
        new CustomEvent('day-change', {
          bubbles: true,
          detail: { value: event.target.value || '' },
        })
      );
    });
  }
}
