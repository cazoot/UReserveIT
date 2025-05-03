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
