// DOM Elements
const datetimeEl = document.getElementById('datetime');
const monthYearEl = document.getElementById('monthYear');
const calendarDays = document.getElementById('calendar-days');
const calendar = document.getElementById('calendar');
const selectedDateEl = document.getElementById('selectedDate');
const lrcHoursEl = document.getElementById('lrc-hours');
const maxDurationEl = document.getElementById('max-duration');

// Current date and selected date information
let currentDate = new Date();
let selectedReservationDate = null;
let selectedDayOfWeek = null;
let reservations = {};
let operatingHours = {};
let maxReservationHours = 2;

// Update the datetime display
function updateDateTime() {
  datetimeEl.textContent = new Date().toLocaleString();
}
setInterval(updateDateTime, 1000);
updateDateTime();

// Show the main content
function showMainContent() {
  document.querySelector('.landing-page').style.display = 'none';
  document.querySelector('.main-content').style.display = 'block';
  loadReservations();
  loadOperatingHours();
}

// Load LRC operating hours
async function loadOperatingHours() {
  try {
    const response = await fetch('/api/hours');

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    operatingHours = data.hours;
    maxReservationHours = data.max_duration;

    // Update the UI with operating hours
    maxDurationEl.textContent = maxReservationHours;

    // Format and display the hours
    let hoursHtml = '';
    for (const [day, hours] of Object.entries(operatingHours)) {
      hoursHtml += `<div><strong>${day}:</strong> ${hours}</div>`;
    }
    lrcHoursEl.innerHTML = hoursHtml;

    // Log for debugging
    console.log('Operating hours loaded:', operatingHours);

  } catch (error) {
    console.error('Error loading operating hours:', error);
    lrcHoursEl.innerHTML = 'Failed to load operating hours. Please refresh the page.';
  }
}

// Load all reservations from the API
async function loadReservations() {
  try {
    const response = await fetch('/api/reservations');

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    reservations = await response.json();
    await renderCalendar(currentDate);
  } catch (error) {
    console.error('Error loading reservations:', error);
    alert('Failed to load reservations. Please try again later.');
  }
}

// Check if a specific date is a holiday
async function checkHoliday(dateStr) {
  try {
    const response = await fetch(`/api/holidays/${dateStr}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    return { is_holiday: false };
  }
}

// Format date key for use with the reservations object
function formatDateKey(date) {
  // Add 1 to month because JavaScript months are 0-indexed (0 = January)
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

// Render the calendar for a specific month
async function renderCalendar(date) {
  monthYearEl.textContent = `${date.toLocaleString('default', { month: 'long' })} ${date.getFullYear()}`;
  calendarDays.innerHTML = '';
  calendar.innerHTML = '';

  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const startDay = firstDay.getDay();

  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  dayNames.forEach(day => {
    const dayNameEl = document.createElement('div');
    dayNameEl.className = 'day-name';
    dayNameEl.textContent = day;
    calendarDays.appendChild(dayNameEl);
  });

  for (let i = 0; i < startDay; i++) {
    calendar.appendChild(document.createElement('div'));
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dayEl = document.createElement('div');
    dayEl.className = 'day';

    // Create date obj and date key for checking reservations
    const dateObj = new Date(date.getFullYear(), date.getMonth(), d);
    const dateKey = formatDateKey(dateObj);

    // Check if this date is a holiday
    const holidayInfo = await checkHoliday(dateKey);
    const isHoliday = holidayInfo.is_holiday || false;
    const holidayName = holidayInfo.holiday_name || "";

    const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 6 = Saturday

    // Check if this day is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (dateObj < today) {
      // Day is in the past
      dayEl.classList.add('reserved');
      dayEl.style.opacity = '0.5';
      dayEl.style.cursor = 'not-allowed';
      dayEl.title = 'Past date - Not available for reservation';
    } 
    // Check if there's a reservation for this day
    // Check if it is a holiday
    else if (isHoliday) {
      dayEl.classList.add("reserved");
      dayEl.title = `Holiday: ${holidayName} - LRC closed`;

      // Add holiday label
      const holidayLabel = document.createElement("div");
      holidayLabel.className = "holiday-label";
      holidayLabel.textContent = "Holiday";
      dayEl.appendChild(holidayLabel);
    }
    else if (reservations[dateKey]) {
      if (reservations[dateKey].status === 'reserved') {
        dayEl.classList.add('reserved');
        dayEl.title = 'Already reserved';
      } else if (reservations[dateKey].status === 'owned') {
        dayEl.classList.add('owned');
        dayEl.title = 'Your reservation';
      }
    }
    // Check if day is available for reservation
    else {
      // Get day name for this date
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const dayName = dayNames[dayOfWeek];

      if (operatingHours && operatingHours[dayName]) {
        dayEl.title = `Available for reservation. Hours: ${operatingHours[dayName]}`;
      } else {
        dayEl.title = 'Available for reservation';
      }

      // Simply show the date number
      const dateSpan = document.createElement('span');
      dateSpan.textContent = d;
      dayEl.appendChild(dateSpan);
    }

    // Set the date text
    if (!dayEl.textContent) {
      dayEl.textContent = d;
    }

    // Only allow selecting future dates that don't have reservations
    if (dateObj >= today && !reservations[dateKey] && !isHoliday) {
      dayEl.onclick = () => {
        showForm(dateKey, dateObj);
      };

      // Add hover style
      dayEl.style.position = 'relative';
    } else if (reservations[dateKey] && reservations[dateKey].status === 'reserved') {
      // Just maintain position relative without adding the X indicator
      dayEl.style.position = 'relative';
    }

    calendar.appendChild(dayEl);
  }
}

// Change the currently displayed month
async function changeMonth(offset) {
  currentDate.setMonth(currentDate.getMonth() + offset);
    await renderCalendar(currentDate);
}

// Get available time slots for a given day
function getAvailableTimeSlots(dayOfWeek, room) {
  // Get day name and its operating hours
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = dayNames[dayOfWeek];

  let availableSlots = [];
  let startHour, endHour;

  // Determine operating hours based on the day
  if (dayOfWeek === 0) { // Sunday
    startHour = 10; // 10:00 AM
    endHour = 16;   // 4:00 PM
  } else { // Monday-Saturday
    startHour = 7;  // We'll handle the 7:30 special case below
    endHour = 18;   // 6:00 PM
  }

  // Generate available slots in 30-min intervals
  for (let hour = startHour; hour < endHour; hour++) {
    // Skip 7:00 on weekdays (starts at 7:30)
    if (dayOfWeek !== 0 && hour === 7) {
      availableSlots.push({
        value: `07:30`,
        label: `07:30 AM`
      });
      continue;
    }

    // Add hour slots (e.g., 8:00, 9:00)
    let formattedHour = hour.toString().padStart(2, '0');
    let displayHour = hour > 12 ? hour - 12 : hour;
    let amPm = hour >= 12 ? 'PM' : 'AM';

    availableSlots.push({
      value: `${formattedHour}:00`,
      label: `${displayHour === 0 ? 12 : displayHour}:00 ${amPm}`
    });

    // Add half-hour slots (e.g., 8:30, 9:30)
    // Skip 4:30 PM on Sunday (closes at 4:00 PM)
    // Skip 5:30 PM on Weekdays (closes at 6:00 PM)
    if ((dayOfWeek === 0 && hour < 15) || (dayOfWeek !== 0 && hour < 17)) {
      availableSlots.push({
        value: `${formattedHour}:30`,
        label: `${displayHour === 0 ? 12 : displayHour}:30 ${amPm}`
      });
    }
  }

  return availableSlots;
}

// Show the reservation form for a selected date
function showForm(dateKey, dateObj) {
  // Check if the selected date is a holiday
  checkHoliday(dateKey).then(holidayInfo => {
    if (holidayInfo.is_holiday) {
      alert(`The LRC is closed on ${dateObj.toDateString()} due to the holiday: ${holidayInfo.holiday_name}`);
      cancelReservation(); // Go back to calendar view
      return;
    }

    document.getElementById('calendar-page').style.display = 'none';
    document.getElementById('form-page').style.display = 'block';

    // Store the selected date for the reservation
    selectedReservationDate = dateKey;

    // Store the day of week for operating hours check (0 = Sunday, 6 = Saturday)
    selectedDayOfWeek = dateObj.getDay();

    // Get the day name for displaying operating hours
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayName = dayNames[selectedDayOfWeek];

    // Display the selected date with operating hours
    const formattedDate = dateObj.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    // Display operating hours info based on day of week
    let operatingHoursText = selectedDayOfWeek === 0 ? 
      "10:00 AM - 4:00 PM" : // Sunday
      "07:30 AM - 6:00 PM";  // Monday-Saturday

    // Add operating hours information
    let operatingHoursInfo = `
      <div class="mt-2">
        <strong>LRC Hours:</strong> ${operatingHoursText}
      </div>
      <div class="mt-1 small text-muted">
        Maximum reservation time: ${maxReservationHours} hours
      </div>`;

    selectedDateEl.innerHTML = `<strong>Selected Date:</strong> ${formattedDate}${operatingHoursInfo}`;

    // Clear the form
    document.getElementById('students').innerHTML = '';
    document.getElementById('room').value = '';
    document.getElementById('time').value = '';
    document.getElementById('endTime').value = '';
    document.getElementById('seats').value = '2'; // Default to 2 seats
    document.getElementById('email').value = '';

    // Hide the time availability section initially
    document.getElementById('time-availability').style.display = 'none';

    // Add first student entry
    addStudent();

    // Clear any existing event listeners by cloning and replacing the element
    const roomSelect = document.getElementById('room');
    const newRoomSelect = roomSelect.cloneNode(true);
    roomSelect.parentNode.replaceChild(newRoomSelect, roomSelect);

    // Add event listener for room selection to show available time slots
    newRoomSelect.addEventListener('change', function() {
      // If a room is selected, show available time slots
      if (this.value) {
        // Show the time availability section
        document.getElementById('time-availability').style.display = 'block';
        // Generate and display available time slots
        generateTimeSlots(this.value);
      } else {
        // Hide the time availability section if no room is selected
        document.getElementById('time-availability').style.display = 'none';
      }
    });

    // Set up form submission handler
    document.getElementById('reservation-form').onsubmit = handleFormSubmit;

    // Clear and re-attach time input event listeners to prevent duplicates
    const timeInput = document.getElementById('time');
    const endTimeInput = document.getElementById('endTime');
    const roomInput = document.getElementById('room');

    // Remove existing event listeners by cloning and replacing
    const newTimeInput = timeInput.cloneNode(true);
    const newEndTimeInput = endTimeInput.cloneNode(true);

    timeInput.parentNode.replaceChild(newTimeInput, timeInput);
    endTimeInput.parentNode.replaceChild(newEndTimeInput, endTimeInput);

    // Add fresh event listeners
    newTimeInput.addEventListener('change', handleTimeChange); // Add the handler to update end time
    newTimeInput.addEventListener('change', checkTimeAvailability);
    newEndTimeInput.addEventListener('change', checkTimeAvailability);
    newEndTimeInput.addEventListener('change', updateDurationDisplay);
    roomInput.addEventListener('change', checkTimeAvailability);
  });
}

// Cancel the reservation process and go back to calendar
function cancelReservation() {
  document.getElementById('form-page').style.display = 'none';
  document.getElementById('calendar-page').style.display = 'block';
}

// Add a student entry to the reservation form
function addStudent() {
  const studentDiv = document.createElement('div');
  studentDiv.className = 'student-entry';

  // Generate a unique ID for this student entry
  const studentId = `student-${Date.now()}`;

  studentDiv.innerHTML = `
    <button type="button" class="remove-student" onclick="removeStudent('${studentId}')">
      <i class="fa fa-times"></i>
    </button>
    <div class="mb-3">
      <label for="${studentId}-name" class="form-label">Name:</label>
      <input type="text" id="${studentId}-name" class="form-control" name="name[]" required>
    </div>
    <div class="mb-3">
      <label for="${studentId}-id" class="form-label">Student ID:</label>
      <input type="text" id="${studentId}-id" class="form-control" name="studentId[]" required>
    </div>
  `;

  studentDiv.id = studentId;
  document.getElementById('students').appendChild(studentDiv);
}

// Remove a student entry from the form
function removeStudent(studentId) {
  const studentEntry = document.getElementById(studentId);
  if (studentEntry) {
    // Check if this is the last student entry
    const studentEntries = document.querySelectorAll('.student-entry');
    if (studentEntries.length > 1) {
      studentEntry.remove();
    } else {
      alert('At least one student is required.');
    }
  }
}

// Handle time input change to validate and update end time
function handleTimeChange() {
  const startTimeInput = document.getElementById('time');
  const endTimeInput = document.getElementById('endTime');

  if (startTimeInput.value) {
    // Parse the start time
    const [hours, minutes] = startTimeInput.value.split(':').map(Number);

    // Calculate default end time (2 hours after start time)
    let endHours = hours + 2;

    // Check if we've gone past midnight
    if (endHours >= 24) {
      endHours = 23;
      endTimeInput.value = `23:59`;
    } else {
      // Format the end time properly
      const formattedEndHours = endHours.toString().padStart(2, '0');
      endTimeInput.value = `${formattedEndHours}:${minutes.toString().padStart(2, '0')}`;

      // Update the duration display
      updateDurationDisplay();
    }
  }
}

// Register initial DOM event listeners
document.addEventListener('DOMContentLoaded', function() {
  // No need to add any time change listeners here as they're added in showForm
});

// Handle the reservation form submission
async function handleFormSubmit(event) {
  event.preventDefault();

  // Gather form data
  const room = document.getElementById('room').value;
  const startTime = document.getElementById('time').value;
  const endTime = document.getElementById('endTime').value;
  const seats = document.getElementById('seats').value;
  const email = document.getElementById('email').value;

  // Check availability before submitting
  await checkTimeAvailability();

  // If there's a conflict message visible, don't submit
  const availabilityMessage = document.getElementById('availability-message');
  if (availabilityMessage && availabilityMessage.textContent.includes('Conflict')) {
    alert('Please select a different time. The current time slot has a conflict.');
    return;
  }

  // Get all student entries
  const studentNames = Array.from(document.getElementsByName('name[]')).map(input => input.value);
  const studentIds = Array.from(document.getElementsByName('studentId[]')).map(input => input.value);

  // Check if all required fields are filled
  if (!room || !startTime || !endTime || !email || !seats || studentNames.includes('') || studentIds.includes('')) {
    alert('Please fill out all required fields.');
    return;
  }

  // Combine student information
  const students = studentNames.map((name, index) => ({
    name,
    studentId: studentIds[index]
  }));

  // Create reservation data
  const reservationData = {
    date: selectedReservationDate,
    room,
    time: startTime,
    endTime: endTime,
    seats: parseInt(seats, 10),
    email,
    students
  };

  try {
    // Send reservation data to the server
    const response = await fetch('/api/reservations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(reservationData)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create reservation.');
    }

    // Handle successful response
    const data = await response.json();

    // Show success message and reset the form
    alert('Reservation created successfully! A confirmation email will be sent to your email address.');

    // Update local reservations and go back to calendar
    reservations[selectedReservationDate] = {
      status: 'owned',
      ...reservationData
    };

    // Return to calendar view with updated reservations
    renderCalendar(currentDate);
    cancelReservation();

  } catch (error) {
    console.error('Error creating reservation:', error);
    alert(`Failed to create reservation: ${error.message}`);
  }
}

// Check if the selected time is available
async function checkTimeAvailability() {
  const roomSelect = document.getElementById('room');
  const startTimeInput = document.getElementById('time');
  const endTimeInput = document.getElementById('endTime');
  const availabilityMessage = document.getElementById('availability-message');

  // Clear previous message
  if (availabilityMessage) {
    availabilityMessage.textContent = '';
    availabilityMessage.className = '';
    availabilityMessage.style.display = 'none';
  }

  // Check if all required fields are selected
  if (!roomSelect.value || !startTimeInput.value || !endTimeInput.value || !selectedReservationDate) {
    return;
  }

  // Check if we have the latest data
  await loadReservations();

  // Check availability with the backend
  const response = await fetch(`/api/reservations/${selectedReservationDate}?room=${roomSelect.value}&start_time=${startTimeInput.value}&end_time=${endTimeInput.value}`);
  const data = await response.json();

  if (!data.available) {
    availabilityMessage.textContent = data.reason || 'Time slot is not available';
    availabilityMessage.className = 'alert alert-danger mt-3';
    availabilityMessage.style.display = 'block';
    return;
  }

  availabilityMessage.textContent = 'Time slot is available!';
  availabilityMessage.className = 'alert alert-success mt-3';
  availabilityMessage.style.display = 'block';
}

// Generate time slot grid for the selected room
async function generateTimeSlots(roomId) {
  const slotsContainer = document.getElementById('timeslot-container');
  slotsContainer.innerHTML = '';

  // Get the operating hours based on the day of week
  const availableSlots = getAvailableTimeSlots(selectedDayOfWeek, roomId);

  // Check if there are reserved slots for this day and room
  let reservedTimeRanges = [];
  if (reservations[selectedReservationDate] && 
      reservations[selectedReservationDate].room === roomId) {

    // Add the reserved time range
    const startTime = reservations[selectedReservationDate].time;
    const endTime = reservations[selectedReservationDate].endTime;
    reservedTimeRanges.push({ start: startTime, end: endTime });
  }

  // Create the time slot grid
  availableSlots.forEach(slot => {
    const timeSlot = document.createElement('div');
    timeSlot.className = 'timeslot';
    timeSlot.dataset.time = slot.value;

    // Check if this slot is within any reserved time ranges
    let isReserved = false;
    let reservedTimeInfo = '';
    for (const range of reservedTimeRanges) {
      const slotTime = slot.value;
      const [slotHours, slotMinutes] = slotTime.split(':').map(Number);
      const slotTotalMinutes = slotHours * 60 + slotMinutes;

      // Calculate reservation end time (2 hours after slot time)
      const slotEndTotalMinutes = slotTotalMinutes + (maxReservationHours * 60);

      // Parse range times
      const [rangeStartHours, rangeStartMinutes] = range.start.split(':').map(Number);
      const [rangeEndHours, rangeEndMinutes] = range.end.split(':').map(Number);
      const rangeStartTotalMinutes = rangeStartHours * 60 + rangeStartMinutes;
      const rangeEndTotalMinutes = rangeEndHours * 60 + rangeEndMinutes;

      // Check for overlap
      if (slotTotalMinutes < rangeEndTotalMinutes && slotEndTotalMinutes > rangeStartTotalMinutes) {
        isReserved = true;
        reservedTimeInfo = `Reserved: ${range.start} - ${range.end}`;
        break;
      }
    }

    // Add appropriate classes for visual styling
    if (isReserved) {
      timeSlot.classList.add('unavailable');
      timeSlot.title = reservedTimeInfo;
    } else {
      timeSlot.title = 'Available for booking';

      // Make available slots clickable
      timeSlot.onclick = function() {
        // Remove selected class from any previously selected slot
        document.querySelectorAll('.timeslot.selected').forEach(slot => {
          slot.classList.remove('selected');
        });

        // Add selected class to this slot
        this.classList.add('selected');

        document.getElementById('time').value = slot.value;
        handleTimeChange(); // This will update end time automatically
        checkTimeAvailability();
      };
    }

    // Show the time (e.g., "9:00 AM")
    timeSlot.textContent = slot.label;
    slotsContainer.appendChild(timeSlot);
  });
}

// Format time for display
function formatTime(hours, minutes) {
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

// Update the duration display
function updateDurationDisplay() {
  const startTimeInput = document.getElementById('time');
  const endTimeInput = document.getElementById('endTime');

  if (startTimeInput.value && endTimeInput.value) {
    const [startHours, startMinutes] = startTimeInput.value.split(':').map(Number);
    const [endHours, endMinutes] = endTimeInput.value.split(':').map(Number);

    // Convert to minutes for easier calculation
    const startTotalMinutes = startHours * 60 + startMinutes;
    const endTotalMinutes = endHours * 60 + endMinutes;

    // Calculate duration in hours and minutes
    const durationMinutes = endTotalMinutes - startTotalMinutes;

    if (durationMinutes <= 0) {
      alert('End time must be after start time.');
      // Reset end time to 2 hours after start time
      handleTimeChange();
      return;
    }

    const durationHours = Math.floor(durationMinutes / 60);
    const remainingMinutes = durationMinutes % 60;

    // Format duration string
    let durationStr;
    if (durationHours > 0 && remainingMinutes > 0) {
      durationStr = `${durationHours} hour${durationHours > 1 ? 's' : ''} and ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`;
    } else if (durationHours > 0) {
      durationStr = `${durationHours} hour${durationHours > 1 ? 's' : ''}`;
    } else {
      durationStr = `${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`;
    }
  }
}