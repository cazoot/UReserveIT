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
    renderCalendar(currentDate);
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
    console.error('Error checking holiday:', error);
    return { is_holiday: false };
  }
}

// Format date key for use with the reservations object
function formatDateKey(date) {
  // Add 1 to month because JavaScript months are 0-indexed (0 = January)
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

// Render the calendar for a specific month
function renderCalendar(date) {
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
    
    // Create date key for checking reservations
    const dateObj = new Date(date.getFullYear(), date.getMonth(), d);
    const key = formatDateKey(dateObj);
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
    else if (reservations[key]) {
      if (reservations[key].status === 'reserved') {
        dayEl.classList.add('reserved');
        dayEl.title = 'Already reserved';
      } else if (reservations[key].status === 'owned') {
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
    if (dateObj >= today && !reservations[key]) {
      dayEl.onclick = () => {
        showForm(key, dateObj);
      };
      
      // Add hover style
      dayEl.style.position = 'relative';
    } else if (reservations[key] && reservations[key].status === 'reserved') {
      // Just maintain position relative without adding the X indicator
      dayEl.style.position = 'relative';
    }
    
    calendar.appendChild(dayEl);
  }
}

// Change the currently displayed month
function changeMonth(offset) {
  currentDate.setMonth(currentDate.getMonth() + offset);
  renderCalendar(currentDate);
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
  if (availabilityMessage && 
      availabilityMessage.style.display === 'block' && 
      availabilityMessage.classList.contains('alert-danger')) {
    alert('Cannot submit reservation. The selected room is not available for the chosen time period. Please select a different time or room.');
    return;
  }
  
  // Validate time inputs
  if (startTime >= endTime) {
    alert('End time must be after start time.');
    return;
  }
  
  // Calculate duration in hours
  const [startHours, startMinutes] = startTime.split(':').map(Number);
  const [endHours, endMinutes] = endTime.split(':').map(Number);
  
  const startTotalMinutes = startHours * 60 + startMinutes;
  const endTotalMinutes = endHours * 60 + endMinutes;
  const durationMinutes = endTotalMinutes - startTotalMinutes;
  const durationHours = durationMinutes / 60;
  
  // Check if duration exceeds maximum (2 hours)
  if (durationHours > maxReservationHours) {
    alert(`Reservation cannot exceed ${maxReservationHours} hours. Please adjust your end time.`);
    return;
  }
  
  // Gather student information
  const students = [];
  const nameInputs = document.querySelectorAll('input[name="name[]"]');
  const idInputs = document.querySelectorAll('input[name="studentId[]"]');
  
  for (let i = 0; i < nameInputs.length; i++) {
    students.push({
      name: nameInputs[i].value,
      studentId: idInputs[i].value
    });
  }
  
  // Create the reservation data
  const reservationData = {
    date: selectedReservationDate,
    room,
    time: startTime,
    endTime,
    seats,
    email,
    students
  };
  
  try {
    // Submit the reservation to the API
    const response = await fetch('/api/reservations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(reservationData)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to submit reservation');
    }
    
    // Handle successful reservation
    const result = await response.json();
    alert('Reservation submitted successfully!');
    
    // Create a unique key for storing the reservation
    const reservationKey = `${selectedReservationDate}-room${room}`;
    
    // Update the reservations and return to calendar view
    reservations[reservationKey] = {
      status: 'owned',
      details: reservationData
    };
    
    document.getElementById('form-page').style.display = 'none';
    document.getElementById('calendar-page').style.display = 'block';
    renderCalendar(currentDate);
    
  } catch (error) {
    console.error('Error submitting reservation:', error);
    alert(`Failed to submit reservation: ${error.message}`);
  }
}

// Check if the selected time slot is available
async function checkTimeAvailability() {
  const roomSelect = document.getElementById('room');
  const startTimeInput = document.getElementById('time');
  const endTimeInput = document.getElementById('endTime');
  const availabilityMessage = document.getElementById('availability-message') || 
    (function() {
      // Create element if it doesn't exist
      const div = document.createElement('div');
      div.id = 'availability-message';
      div.className = 'alert mt-3';
      div.style.display = 'none';
      document.getElementById('reservation-form').prepend(div);
      return div;
    })();
  
  // Clear previous message
  availabilityMessage.style.display = 'none';
  availabilityMessage.textContent = '';
  availabilityMessage.className = 'alert mt-3';
  
  // Only proceed if all required values are set
  if (!roomSelect.value || !startTimeInput.value || !endTimeInput.value || !selectedReservationDate) {
    return;
  }
  
  // Get all reservations for this date
  try {
    // Refresh reservations data to ensure we have the latest
    await loadReservations();
    
    // Parse time values
    const [startHours, startMinutes] = startTimeInput.value.split(':').map(Number);
    const [endHours, endMinutes] = endTimeInput.value.split(':').map(Number);
    
    const startTotalMinutes = startHours * 60 + startMinutes;
    const endTotalMinutes = endHours * 60 + endMinutes;
    
    // Check for any conflicting reservations
    let hasConflict = false;
    let conflictMessage = '';
    
    // Loop through all reservations and check for conflicts
    for (const [key, reservation] of Object.entries(reservations)) {
      const details = reservation.details || {};
      
      // Only check reservations for the same date and room
      if (details.date === selectedReservationDate && details.room === roomSelect.value) {
        const rStartTime = details.time || '';
        const rEndTime = details.endTime || '';
        
        if (rStartTime && rEndTime) {
          // Parse reservation times
          const [rStartHours, rStartMinutes] = rStartTime.split(':').map(Number);
          const [rEndHours, rEndMinutes] = rEndTime.split(':').map(Number);
          
          const rStartTotalMinutes = rStartHours * 60 + rStartMinutes;
          const rEndTotalMinutes = rEndHours * 60 + rEndMinutes;
          
          // Check for overlap
          if (startTotalMinutes < rEndTotalMinutes && endTotalMinutes > rStartTotalMinutes) {
            hasConflict = true;
            conflictMessage = `Room ${roomSelect.value} is already reserved from ${formatTime(rStartHours, rStartMinutes)} to ${formatTime(rEndHours, rEndMinutes)}`;
            break;
          }
        }
      }
    }
    
    // Display appropriate message
    if (hasConflict) {
      availabilityMessage.textContent = conflictMessage;
      availabilityMessage.className = 'alert alert-danger mt-3';
      availabilityMessage.style.display = 'block';
    } else {
      availabilityMessage.textContent = `Room ${roomSelect.value} is available for the selected time!`;
      availabilityMessage.className = 'alert alert-success mt-3';
      availabilityMessage.style.display = 'block';
    }
  } catch (error) {
    console.error('Error checking time availability:', error);
  }
}

// Generate and display available time slots based on operating hours and existing reservations
async function generateTimeSlots(roomId) {
  // Clear the container first
  const timeslotContainer = document.getElementById('timeslot-container');
  timeslotContainer.innerHTML = '';
  
  // Set the selected time info
  const selectedTimesInfo = document.getElementById('selected-times');
  selectedTimesInfo.innerHTML = 'Please select a starting time above';
  
  // Get operating hours based on the day of week
  let startHour, endHour;
  
  if (selectedDayOfWeek === 0) { // Sunday
    startHour = 10; // 10:00 AM
    endHour = 16;   // 4:00 PM
  } else { // Monday - Saturday
    startHour = 7;  // 7:30 AM
    endHour = 18;   // 6:00 PM
  }
  
  // Get existing reservations for this room and date
  await loadReservations(); // Refresh reservations to ensure we have the latest data
  const bookedTimeSlots = [];
  
  // Loop through all reservations and find conflicts for this room/date
  for (const [key, reservation] of Object.entries(reservations)) {
    const details = reservation.details || {};
    
    // Only check reservations for the same date and room
    if (details.date === selectedReservationDate && details.room === roomId) {
      const rStartTime = details.time || '';
      const rEndTime = details.endTime || '';
      
      if (rStartTime && rEndTime) {
        // Parse reservation times
        const [rStartHours, rStartMinutes] = rStartTime.split(':').map(Number);
        const [rEndHours, rEndMinutes] = rEndTime.split(':').map(Number);
        
        // Add to booked slots
        bookedTimeSlots.push({
          start: rStartHours * 60 + rStartMinutes,
          end: rEndHours * 60 + rEndMinutes
        });
      }
    }
  }
  
  // Create time slots at 30-minute intervals
  const timeSlots = [];
  
  // Special case for 7:30 AM start time on weekdays
  let currentMinute = (selectedDayOfWeek === 0) ? 0 : 30;
  let currentHour = startHour;
  
  while (currentHour < endHour) {
    const slotTotalMinutes = currentHour * 60 + currentMinute;
    
    // Check if this slot is booked
    let isBooked = false;
    for (const bookedSlot of bookedTimeSlots) {
      // Consider a slot booked if it falls within a reservation
      if (slotTotalMinutes >= bookedSlot.start && slotTotalMinutes < bookedSlot.end) {
        isBooked = true;
        break;
      }
      
      // For the time slot display, we only want to show a slot as unavailable
      // if there's no possibility to make a reservation starting at this slot
      // Get the closing hour for this day
      const closingHour = selectedDayOfWeek === 0 ? 16 : 18; // 4 PM for Sunday, 6 PM otherwise
      const closingTotalMinutes = closingHour * 60;
      
      // Calculate the time until the next booking starts (if any)
      if (slotTotalMinutes < bookedSlot.start) {
        const timeUntilBooking = bookedSlot.start - slotTotalMinutes;
        
        // If we have less than 30 minutes before the next booking, mark as unavailable
        if (timeUntilBooking < 30) {
          isBooked = true;
          break;
        }
      }
    }
    
    timeSlots.push({
      hour: currentHour,
      minute: currentMinute,
      isBooked: isBooked,
      totalMinutes: slotTotalMinutes
    });
    
    // Move to next 30-minute slot
    currentMinute += 30;
    if (currentMinute >= 60) {
      currentMinute = 0;
      currentHour++;
    }
  }
  
  // Keep track of conflict information for tooltip display
  const conflictInfo = {};
  
  // Find conflicts for each time slot
  for (const bookedSlot of bookedTimeSlots) {
    // Find all time slots that would conflict with this booking
    for (let i = 0; i < timeSlots.length; i++) {
      const slot = timeSlots[i];
      const slotEndTime = slot.totalMinutes + 120; // Assuming 2-hour reservation
      
      if ((slot.totalMinutes < bookedSlot.end && slotEndTime > bookedSlot.start)) {
        // This slot would conflict
        if (!conflictInfo[slot.totalMinutes]) {
          conflictInfo[slot.totalMinutes] = [];
        }
        
        // Add conflict info (format the times for display)
        const conflictStartHours = Math.floor(bookedSlot.start / 60);
        const conflictStartMinutes = bookedSlot.start % 60;
        const conflictEndHours = Math.floor(bookedSlot.end / 60);
        const conflictEndMinutes = bookedSlot.end % 60;
        
        conflictInfo[slot.totalMinutes].push(
          `${formatTime(conflictStartHours, conflictStartMinutes)} - ${formatTime(conflictEndHours, conflictEndMinutes)}`
        );
      }
    }
  }
  
  // Render time slots
  timeSlots.forEach(slot => {
    const timeSlotElement = document.createElement('div');
    timeSlotElement.className = slot.isBooked ? 'timeslot unavailable' : 'timeslot';
    timeSlotElement.textContent = formatTime(slot.hour, slot.minute);
    
    // Add tooltip with conflict information if unavailable
    if (slot.isBooked && conflictInfo[slot.totalMinutes]) {
      timeSlotElement.title = `This time slot is not available. Conflicts with: ${conflictInfo[slot.totalMinutes].join(', ')}`;
    }
    
    // Add data attributes for the time value
    timeSlotElement.dataset.hour = slot.hour;
    timeSlotElement.dataset.minute = slot.minute;
    timeSlotElement.dataset.totalMinutes = slot.totalMinutes;
    
    // Add click handler for available slots
    if (!slot.isBooked) {
      timeSlotElement.addEventListener('click', function() {
        // Clear previous selections
        document.querySelectorAll('.timeslot.selected').forEach(el => {
          el.classList.remove('selected');
        });
        
        // Select this time slot
        this.classList.add('selected');
        
        // Format the time for the input field
        const formattedHour = slot.hour.toString().padStart(2, '0');
        const formattedMinute = slot.minute.toString().padStart(2, '0');
        const timeValue = `${formattedHour}:${formattedMinute}`;
        
        // Calculate end time (2 hours later)
        let endHour = slot.hour + 2;
        let endMinute = slot.minute;
        
        // Get the closing hour for this day
        const closingHour = selectedDayOfWeek === 0 ? 16 : 18; // 4 PM for Sunday, 6 PM otherwise
        
        // Check if calculated end time exceeds operating hours
        if (endHour > closingHour || (endHour === closingHour && endMinute > 0)) {
          // If calculated end time exceeds operating hours, adjust it to closing time
          endHour = closingHour;
          endMinute = 0;
        }
        
        const formattedEndHour = endHour.toString().padStart(2, '0');
        const formattedEndMinute = endMinute.toString().padStart(2, '0');
        const endTimeValue = `${formattedEndHour}:${formattedEndMinute}`;
        
        // Set the form input values
        document.getElementById('time').value = timeValue;
        document.getElementById('endTime').value = endTimeValue;
        
        // Calculate actual duration
        const startTotalMin = slot.hour * 60 + slot.minute;
        const endTotalMin = endHour * 60 + endMinute;
        const durationMinutes = endTotalMin - startTotalMin;
        const durationHours = Math.floor(durationMinutes / 60);
        const remainingMinutes = durationMinutes % 60;
        
        // Format duration text
        let durationText = '';
        if (durationHours > 0) {
            durationText += `${durationHours} hour${durationHours > 1 ? 's' : ''}`;
        }
        if (remainingMinutes > 0) {
            durationText += `${durationHours > 0 ? ' and ' : ''}${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`;
        }
        
        // Update the selected time info
        // Update the selected time info (empty now)
        selectedTimesInfo.innerHTML = ``;
        
        // Trigger the time availability check
        checkTimeAvailability();
      });
    }
    
    timeslotContainer.appendChild(timeSlotElement);
  });
}

// Helper function to format time for display
function formatTime(hours, minutes) {
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12; // Convert 0 to 12 for 12 AM
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

// Add css legend colors
document.addEventListener('DOMContentLoaded', function() {
  const style = document.createElement('style');
  style.textContent = `
    .legend-color {
      display: inline-block;
      width: 20px;
      height: 20px;
      border-radius: 4px;
      margin-right: 8px;
    }
  `;
  document.head.appendChild(style);
  
  // The calendar will be rendered when the user clicks "Enter"
});

// Function to calculate and display the reservation duration
function updateDurationDisplay() {
  const startTimeInput = document.getElementById('time');
  const endTimeInput = document.getElementById('endTime');
  
  if (startTimeInput.value && endTimeInput.value) {
    // Parse the start and end times
    const [startHours, startMinutes] = startTimeInput.value.split(':').map(Number);
    const [endHours, endMinutes] = endTimeInput.value.split(':').map(Number);
    
    // Calculate duration in minutes
    const startTotalMinutes = startHours * 60 + startMinutes;
    const endTotalMinutes = endHours * 60 + endMinutes;
    
    // Calculate duration in hours and minutes
    if (endTotalMinutes >= startTotalMinutes) {
      const durationMinutes = endTotalMinutes - startTotalMinutes;
      const durationHours = Math.floor(durationMinutes / 60);
      const remainingMinutes = durationMinutes % 60;
      
      // Remove any existing duration display element
      const durationEl = document.getElementById('duration-display');
      if (durationEl) {
        durationEl.style.display = 'none';
      }
    }
  }
}
