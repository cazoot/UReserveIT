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
      
      // Format duration text
      let durationText = '';
      if (durationHours > 0) {
        durationText += `${durationHours} hour${durationHours > 1 ? 's' : ''}`;
      }
      if (remainingMinutes > 0) {
        durationText += `${durationHours > 0 ? ' and ' : ''}${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`;
      }
      
      // Display duration text
      const durationEl = document.getElementById('duration-display');
      if (durationEl) {
        durationEl.textContent = `Duration: ${durationText}`;
        durationEl.style.display = 'block';
      } else {
        // Create duration display element if it doesn't exist
        const timeAvailabilitySection = document.getElementById('time-availability');
        const durationDisplay = document.createElement('div');
        durationDisplay.id = 'duration-display';
        durationDisplay.className = 'alert alert-info mt-2';
        durationDisplay.textContent = `Duration: ${durationText}`;
        timeAvailabilitySection.appendChild(durationDisplay);
      }
    }
  }
}

// Update the handleTimeChange function to enable duration recalculation
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
    }
    
    // Update the duration display
    updateDurationDisplay();
  }
}
