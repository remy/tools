document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('rateCalculatorForm');
  const daysOffCountInput = document.getElementById('daysOffCount');
  const resultsBox = document.getElementById('results');
  const errorMessage = document.getElementById('error-message');

  function showError(message) {
    if (!errorMessage) {
      console.error(message);
      return;
    }
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    if (resultsBox) {
      resultsBox.style.display = 'none';
    }
  }

  function clearError() {
    if (!errorMessage) return;
    errorMessage.textContent = '';
    errorMessage.style.display = 'none';
  }

  // Collect all inputs we need to listen to for live updates
  const inputElements = [
    document.getElementById('startDate'),
    document.getElementById('endDate'),
    document.getElementById('contractRate'),
    daysOffCountInput,
    ...document.querySelectorAll('input[name="workingDay"]'),
    ...document.querySelectorAll('input[name="vatStatus"]'),
  ];

  // --- Helper Functions ---

  function getSelectedWorkingDays() {
    return Array.from(
      document.querySelectorAll('input[name="workingDay"]:checked')
    ).map((cb) => parseInt(cb.value));
  }

  function getVatStatus() {
    const checkedVat = document.querySelector(
      'input[name="vatStatus"]:checked'
    );
    return checkedVat ? checkedVat.value : 'exclusive';
  }

  function getFormState() {
    return {
      startDate: document.getElementById('startDate').value,
      endDate: document.getElementById('endDate').value,
      contractRate: document.getElementById('contractRate').value,
      daysOff: daysOffCountInput?.value ?? '0',
      vatStatus: getVatStatus(),
      workingDays: getSelectedWorkingDays(),
    };
  }

  function updateUrlFromForm() {
    const state = getFormState();
    const params = new URLSearchParams();

    if (state.startDate) params.set('startDate', state.startDate);
    if (state.endDate) params.set('endDate', state.endDate);
    if (state.contractRate) params.set('contractRate', state.contractRate);
    if (state.daysOff) params.set('daysOff', state.daysOff);
    if (state.vatStatus) params.set('vatStatus', state.vatStatus);
    if (state.workingDays.length > 0) {
      params.set('workingDays', state.workingDays.join(','));
    }

    const newQuery = params.toString();
    const newUrl = newQuery
      ? `${window.location.pathname}?${newQuery}`
      : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  }

  function applyUrlStateToForm() {
    const params = new URLSearchParams(window.location.search);

    const startDateValue = params.get('startDate');
    if (startDateValue) {
      document.getElementById('startDate').value = startDateValue;
    }

    const endDateValue = params.get('endDate');
    if (endDateValue) {
      document.getElementById('endDate').value = endDateValue;
    }

    const contractRateValue = params.get('contractRate');
    if (contractRateValue) {
      document.getElementById('contractRate').value = contractRateValue;
    }

    const daysOffValue = params.get('daysOff');
    if (daysOffValue !== null) {
      daysOffCountInput.value = daysOffValue;
    }

    const vatStatusValue = params.get('vatStatus');
    if (vatStatusValue === 'exclusive' || vatStatusValue === 'inclusive') {
      const target = document.querySelector(
        `input[name="vatStatus"][value="${vatStatusValue}"]`
      );
      if (target) target.checked = true;
    }

    if (params.has('workingDays')) {
      const workingDaysRaw = params.get('workingDays') || '';
      const workingDayValues = workingDaysRaw
        .split(',')
        .map((v) => parseInt(v.trim(), 10))
        .filter((num) => !Number.isNaN(num));

      document.querySelectorAll('input[name="workingDay"]').forEach((cb) => {
        cb.checked = workingDayValues.includes(parseInt(cb.value, 10));
      });
    }
  }

  /**
   * Formats a number as a currency string.
   * @param {number} amount
   * @returns {string} Formatted currency string.
   */
  function formatCurrency(amount) {
    return `£${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  }

  /**
   * Calculates the number of working days between two dates (inclusive),
   * respecting the specific selected working days.
   * @param {Date} start
   * @param {Date} end
   * @param {number[]} workingDayIndices - Array of JS day indices (0=Sun, 1=Mon, ..., 6=Sat).
   * @returns {number} The total number of working days.
   */
  function calculateWorkingDays(start, end, workingDayIndices) {
    let count = 0;
    // Clone dates to avoid modifying the original inputs
    const currentDate = new Date(start.getTime());
    const endDate = new Date(end.getTime());

    // Loop through all dates, inclusive
    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay(); // 0 (Sun) to 6 (Sat)

      // Check if the current day is one of the selected working days
      if (workingDayIndices.includes(dayOfWeek)) {
        count++;
      }

      // Move to the next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return count;
  }

  // --- Calculation Core Function ---
  function calculate() {
    const startDateString = document.getElementById('startDate').value;
    const endDateString = document.getElementById('endDate').value;
    let contractRate = parseFloat(
      document.getElementById('contractRate').value
    );
    const vatStatus = getVatStatus();

    // Get the selected working days
    const selectedWorkingDays = getSelectedWorkingDays();

    // --- Graceful Error/Validation Check (Swallowed Errors) ---
    if (
      selectedWorkingDays.length === 0 ||
      !startDateString ||
      !endDateString ||
      isNaN(contractRate) ||
      contractRate <= 0
    ) {
      showError(
        'Please select working days, enter a contract rate, and set both dates.'
      );
      return; // Exit function without alert
    }

    // Normalize dates for accurate comparison
    const startDate = new Date(startDateString);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(endDateString);
    endDate.setHours(0, 0, 0, 0);

    if (startDate > endDate) {
      showError('Error: Start date cannot be after the end date.');
      return; // Exit function without alert
    }

    // Reset error message if validation passes
    clearError();
    if (resultsBox) {
      resultsBox.style.display = 'block';
    }

    // 1. Determine the Contract Rate *before* VAT
    const VAT_RATE = 0.2; // 20%
    let contractRateExclVAT = contractRate;

    if (vatStatus === 'inclusive') {
      contractRateExclVAT = contractRate / (1 + VAT_RATE);
    }

    // 2. Calculate the total working days based on selected weekdays
    let totalCalculatedDays = calculateWorkingDays(
      startDate,
      endDate,
      selectedWorkingDays
    );

    // 3. Subtract Days Off (simple numeric input)
    let daysOffCount = parseInt(daysOffCountInput?.value ?? '0', 10);
    if (isNaN(daysOffCount) || daysOffCount < 0) {
      daysOffCount = 0;
    }
    // Ensure we don't subtract more days off than calculated working days
    if (daysOffCount > totalCalculatedDays) {
      daysOffCount = totalCalculatedDays;
    }

    const effectiveWorkingDays = totalCalculatedDays - daysOffCount;

    // 4. Calculate the Daily Rate
    let effectiveDailyRate = 0;
    if (effectiveWorkingDays > 0) {
      effectiveDailyRate = contractRateExclVAT / effectiveWorkingDays;
    }

    // 5. Display Results
    document.getElementById('resultRate').textContent =
      formatCurrency(contractRateExclVAT);
    document.getElementById('resultTotalDays').textContent =
      totalCalculatedDays.toString();
    document.getElementById('resultDaysOff').textContent =
      daysOffCount.toString();
    document.getElementById('resultDailyRate').textContent =
      formatCurrency(effectiveDailyRate);

    // Sync URL to current form values after a successful calculation
    updateUrlFromForm();
  }

  // --- Initialization and Event Wiring ---

  // Attach 'input' or 'change' listener to all relevant fields for live calculation
  function handleInputChange(event) {
    // For radio buttons, ensure change is captured even when clicking labels
    if (event && event.target && event.target.name === 'vatStatus') {
      updateUrlFromForm();
      calculate();
      return;
    }

    updateUrlFromForm();
    calculate();
  }

  inputElements.forEach((element) => {
    // Use 'input' for text/date fields, 'change' for radios/checkboxes
    const eventType =
      element.type === 'text' ||
      element.type === 'number' ||
      element.type === 'date'
        ? 'input'
        : 'change';
    element.addEventListener(eventType, handleInputChange);
  });

  // Prevent default form submission entirely, as we are using live calculation
  form.addEventListener('submit', (e) => e.preventDefault());

  // Prefill form from URL (if any) before initial calculation
  applyUrlStateToForm();

  // Run calculation on load (will initialize results/error message based on initial state)
  calculate();
});
