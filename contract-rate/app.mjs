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
    const vatStatus = document.querySelector(
      'input[name="vatStatus"]:checked'
    ).value;

    // Get the selected working days
    const selectedWorkingDays = Array.from(
      document.querySelectorAll('input[name="workingDay"]:checked')
    ).map((cb) => parseInt(cb.value));

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
  }

  // --- Initialization and Event Wiring ---

  // Attach 'input' or 'change' listener to all relevant fields for live calculation
  inputElements.forEach((element) => {
    // Use 'input' for text/date fields, 'change' for radios/checkboxes
    const eventType =
      element.type === 'text' ||
      element.type === 'number' ||
      element.type === 'date'
        ? 'input'
        : 'change';
    element.addEventListener(eventType, calculate);
  });

  // Prevent default form submission entirely, as we are using live calculation
  form.addEventListener('submit', (e) => e.preventDefault());

  // Run calculation on load (will initialize results/error message based on initial state)
  calculate();
});
