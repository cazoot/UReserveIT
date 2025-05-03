import os
import json
import datetime
import logging
from pathlib import Path
from flask import Flask, render_template, request, jsonify, redirect, url_for
from flask_cors import CORS
from flask_mail import Mail, Message
from flask_admin import Admin, BaseView, expose, AdminIndexView
from flask_admin.contrib.sqla import ModelView
from flask_login import LoginManager, UserMixin, login_required, login_user, current_user
from datetime import time, datetime as dt, timedelta
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import DeclarativeBase

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

class Base(DeclarativeBase):
    pass

db = SQLAlchemy(model_class=Base)

app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "default-dev-key")
CORS(app)

# Configure the database
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL")
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "pool_recycle": 300,
    "pool_pre_ping": True,
}

# Initialize the app with the extension
db.init_app(app)

# Mail configuration
app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = os.environ.get('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.environ.get('MAIL_PASSWORD')
mail = Mail(app)

# Login configuration
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

class User(UserMixin):
    def __init__(self, id):
        self.id = id

@login_manager.user_loader
def load_user(user_id):
    return User(user_id)

# Admin configuration
admin = Admin(app, name='LRC Admin', template_mode='bootstrap3')

class ReservationsView(BaseView):
    @expose('/')
    @login_required
    def index(self):
        reservations = load_reservations()
        return self.render('admin/reservations.html', reservations=reservations)
        
admin.add_view(ReservationsView(name='Reservations', endpoint='reservations'))

# Admin login routes
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        # Simple admin check - you should use a more secure method in production
        if username == os.environ.get('ADMIN_USERNAME') and password == os.environ.get('ADMIN_PASSWORD'):
            user = User(username)
            login_user(user)
            return redirect('/admin')
    return render_template('admin/login.html')

# Define LRC operating hours
LRC_HOURS = {
    0: {"open": time(10, 0), "close": time(16, 0)},  # Sunday: 10:00 AM - 4:00 PM
    1: {"open": time(7, 30), "close": time(18, 0)},  # Monday: 7:30 AM - 6:00 PM 
    2: {"open": time(7, 30), "close": time(18, 0)},  # Tuesday: 7:30 AM - 6:00 PM
    3: {"open": time(7, 30), "close": time(18, 0)},  # Wednesday: 7:30 AM - 6:00 PM
    4: {"open": time(7, 30), "close": time(18, 0)},  # Thursday: 7:30 AM - 6:00 PM
    5: {"open": time(7, 30), "close": time(18, 0)},  # Friday: 7:30 AM - 6:00 PM
    6: {"open": time(7, 30), "close": time(18, 0)},  # Saturday: 7:30 AM - 6:00 PM
}

# Maximum reservation duration in hours
MAX_RESERVATION_HOURS = 2

# Create data directory if it doesn't exist
data_dir = Path("data")
data_dir.mkdir(exist_ok=True)

# Path to the reservations data file
RESERVATIONS_FILE = data_dir / "reservations.json"
# Path to the holidays data file
HOLIDAYS_FILE = data_dir / "holidays.json"

# Initialize the reservations file if it doesn't exist
if not RESERVATIONS_FILE.exists():
    with open(RESERVATIONS_FILE, 'w') as f:
        json.dump({}, f)


def load_reservations():
    """Load reservations from the JSON file"""
    try:
        with open(RESERVATIONS_FILE, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError) as e:
        logger.error(f"Error loading reservations: {e}")
        return {}


def save_reservations(reservations):
    """Save reservations to the JSON file"""
    try:
        with open(RESERVATIONS_FILE, 'w') as f:
            json.dump(reservations, f)
        return True
    except Exception as e:
        logger.error(f"Error saving reservations: {e}")
        return False


def load_holidays():
    """Load holidays from the JSON file"""
    try:
        if HOLIDAYS_FILE.exists():
            with open(HOLIDAYS_FILE, 'r') as f:
                return json.load(f)
        else:
            logger.warning(f"Holidays file not found: {HOLIDAYS_FILE}")
            return {}
    except (json.JSONDecodeError, FileNotFoundError) as e:
        logger.error(f"Error loading holidays: {e}")
        return {}
        
        
def is_holiday(date_str):
    """Check if a given date is a holiday"""
    try:
        year, month, day = map(int, date_str.split('-'))
        date_obj = dt(year, month, day)
        year_str = str(date_obj.year)
        
        # Format the date as YYYY-MM-DD for comparison
        formatted_date = date_obj.strftime('%Y-%m-%d')
        
        holidays = load_holidays()
        if year_str in holidays:
            for holiday in holidays[year_str]:
                if holiday['date'] == formatted_date:
                    return True, holiday['name']
                    
        return False, None
    except Exception as e:
        logger.error(f"Error checking if date is holiday: {e}")
        return False, None


@app.route('/')
def index():
    """Render the main page"""
    return render_template('index.html')


@app.route('/api/reservations', methods=['GET'])
def get_reservations():
    """Get all reservations"""
    reservations = load_reservations()
    return jsonify(reservations)


@app.route('/api/reservations', methods=['POST'])
def create_reservation():
    """Create a new reservation"""
    data = request.get_json()
    logger.debug(f"Received reservation data: {data}")
    
    # Validate required fields
    required_fields = ['date', 'room', 'time', 'endTime', 'seats', 'email', 'students']
    for field in required_fields:
        if field not in data:
            return jsonify({'error': f'Missing required field: {field}'}), 400
    
    # Validate students data
    if not isinstance(data['students'], list) or len(data['students']) == 0:
        return jsonify({'error': 'At least one student is required'}), 400
    
    for student in data['students']:
        if 'name' not in student or 'studentId' not in student:
            return jsonify({'error': 'Each student must have name and studentId'}), 400
    
    # Validate room selection
    if data['room'] not in ['1', '2']:
        return jsonify({'error': 'Invalid room selection. Please select Room 1 or Room 2'}), 400
    
    # Load existing reservations
    reservations = load_reservations()
    
    # Check for reservations that might conflict with our selected room and time
    # We need to check all reservations to see if there's a time conflict for the selected room
    reservation_conflicts = []
    for reservation_key, reservation_data in reservations.items():
        details = reservation_data.get('details', {})
        
        # Check if this reservation is for the same date and room
        if (details.get('date') == data['date'] and 
            details.get('room') == data['room']):
            reservation_conflicts.append(reservation_data)
    
    # Parse the date to get the day of week
    # Date format from client is YYYY-M-D
    try:
        year, month, day = map(int, data['date'].split('-'))
        # Note: JavaScript getMonth() is 0-based but we're not adding 1 anymore 
        # as we fixed this in the frontend by not subtracting 1 from the month
        reservation_date = dt(year, month, day)  
        day_of_week = reservation_date.weekday()
        
        # Convert to Python's day of week (0 = Monday, 6 = Sunday)
        # Convert to our format (0 = Sunday, 6 = Saturday)
        day_of_week = (day_of_week + 1) % 7
    except (ValueError, IndexError) as e:
        logger.error(f"Error parsing date: {e}")
        return jsonify({'error': 'Invalid date format. Use YYYY-M-D'}), 400
    
    # Check if LRC is open on this day
    if day_of_week not in LRC_HOURS:
        return jsonify({'error': 'The LRC is closed on this day'}), 400
        
    # Check if it's a holiday
    is_holiday_date, holiday_name = is_holiday(data['date'])
    if is_holiday_date:
        return jsonify({'error': f'The LRC is closed on this day ({holiday_name})'}), 400
    
    # Validate reservation times are within LRC hours
    try:
        # Parse the start and end times (format should be HH:MM from the input)
        start_hours, start_minutes = map(int, data['time'].split(':'))
        end_hours, end_minutes = map(int, data['endTime'].split(':'))
        
        start_time = time(start_hours, start_minutes)
        end_time = time(end_hours, end_minutes)
        
        # Get operating hours for this day
        operating_hours = LRC_HOURS[day_of_week]
        
        # Check if times are within operating hours
        if start_time < operating_hours['open']:
            open_time_str = operating_hours['open'].strftime('%I:%M %p')
            return jsonify({
                'error': f'Your reservation starts before opening time. The LRC opens at {open_time_str} on this day'
            }), 400
            
        if end_time > operating_hours['close']:
            close_time_str = operating_hours['close'].strftime('%I:%M %p')
            return jsonify({
                'error': f'Your reservation ends after closing time. The LRC closes at {close_time_str} on this day'
            }), 400
            
        # Calculate duration
        start_minutes_total = start_hours * 60 + start_minutes
        end_minutes_total = end_hours * 60 + end_minutes
        duration_minutes = end_minutes_total - start_minutes_total
        duration_hours = duration_minutes / 60
        
        # Check if duration exceeds max reservation time
        if duration_hours > MAX_RESERVATION_HOURS:
            return jsonify({
                'error': f'Reservation cannot exceed {MAX_RESERVATION_HOURS} hours'
            }), 400
            
        # Check for time conflicts with existing reservations
        for conflict in reservation_conflicts:
            conflict_details = conflict.get('details', {})
            conflict_start = conflict_details.get('time', '')
            conflict_end = conflict_details.get('endTime', '')
            
            if conflict_start and conflict_end:
                # Parse conflict times
                c_start_h, c_start_m = map(int, conflict_start.split(':'))
                c_end_h, c_end_m = map(int, conflict_end.split(':'))
                
                c_start_minutes = c_start_h * 60 + c_start_m
                c_end_minutes = c_end_h * 60 + c_end_m
                
                # Check for overlap
                if (start_minutes_total < c_end_minutes and end_minutes_total > c_start_minutes):
                    return jsonify({
                        'error': f'Room {data["room"]} is already reserved during this time. Please select another time or room.'
                    }), 400
                
    except (ValueError, IndexError) as e:
        logger.error(f"Error parsing time: {e}")
        return jsonify({'error': 'Invalid time format. Use HH:MM'}), 400
    
    # Create a reservation ID
    reservation_id = str(len(reservations) + 1)
    
    # Add creation timestamp
    data['created_at'] = datetime.datetime.now().isoformat()
    data['reservation_id'] = reservation_id
    
    # Add reservation duration
    data['duration_hours'] = duration_hours
    
    # Create a unique key for the reservation that includes the room
    reservation_key = f"{data['date']}-room{data['room']}"
    
    # Add the reservation
    reservations[reservation_key] = {
        'status': 'owned',
        'details': data
    }
    
    # Save the updated reservations
    if save_reservations(reservations):
        # Send confirmation email
        try:
            msg = Message('LRC Room Reservation Confirmation',
                        sender=app.config['MAIL_USERNAME'],
                        recipients=[data['email']])
            msg.body = f"""
            Your room reservation has been confirmed!
            
            Date: {data['date']}
            Room: {data['room']}
            Time: {data['time']} - {data['endTime']}
            Reservation ID: {reservation_id}
            """
            mail.send(msg)
        except Exception as e:
            logger.error(f"Failed to send confirmation email: {e}")
            
        return jsonify({'success': True, 'reservation_id': reservation_id}), 201
    else:
        return jsonify({'error': 'Failed to save reservation'}), 500


@app.route('/api/reservations/<date>', methods=['GET'])
def get_reservation_by_date(date):
    """Get reservation for a specific date"""
    # If room, start_time, and end_time provided, check for availability
    if 'room' in request.args and 'start_time' in request.args and 'end_time' in request.args:
        # Get parameters
        room = request.args.get('room')
        start_time = request.args.get('start_time')
        end_time = request.args.get('end_time')
        
        # Check for conflicts with existing reservations
        reservations_data = load_reservations()
        
        # Generate reservation key
        reservation_key = f"{date}-room{room}"
        
        # Check if this date+room combination is reserved
        is_available = True
        conflict_reason = ""
        
        # Check if it's a holiday
        is_holiday_date, holiday_name = is_holiday(date)
        if is_holiday_date:
            return jsonify({
                'available': False,
                'reason': f'This date is a holiday ({holiday_name}). The LRC is closed.'
            })
            
        # Parse the selected time window
        try:
            s_hours, s_minutes = map(int, start_time.split(':'))
            e_hours, e_minutes = map(int, end_time.split(':'))
            
            # Convert to total minutes for comparison
            start_minutes = s_hours * 60 + s_minutes
            end_minutes = e_hours * 60 + e_minutes
            
            # Check for conflicts
            for key, res_data in reservations_data.items():
                # Only look at reservations for the same date and room
                if key.startswith(date) and f"-room{room}" in key:
                    res_details = res_data.get('details', {})
                    
                    if 'time' in res_details and 'endTime' in res_details:
                        rs_hours, rs_minutes = map(int, res_details['time'].split(':'))
                        re_hours, re_minutes = map(int, res_details['endTime'].split(':'))
                        
                        # Convert to minutes
                        res_start = rs_hours * 60 + rs_minutes
                        res_end = re_hours * 60 + re_minutes
                        
                        # Check for overlap
                        if start_minutes < res_end and end_minutes > res_start:
                            is_available = False
                            conflict_reason = f"Time conflict with existing reservation ({res_details['time']} - {res_details['endTime']})"
                            break
            
            # Check if selected times are within operating hours
            try:
                year, month, day = map(int, date.split('-'))
                reservation_date = dt(year, month, day)
                day_of_week = reservation_date.weekday()
                day_of_week = (day_of_week + 1) % 7  # Convert to our format (0 = Sunday)
                
                # Get operating hours for this day
                operating_hours = LRC_HOURS[day_of_week]
                
                # Convert operating hours to minutes
                open_hour, open_minute = operating_hours['open'].hour, operating_hours['open'].minute
                close_hour, close_minute = operating_hours['close'].hour, operating_hours['close'].minute
                
                open_minutes = open_hour * 60 + open_minute
                close_minutes = close_hour * 60 + close_minute
                
                # Check if reservation is within operating hours
                if start_minutes < open_minutes:
                    is_available = False
                    conflict_reason = f"Your reservation starts before operating hours ({operating_hours['open'].strftime('%I:%M %p')})"
                
                if end_minutes > close_minutes:
                    is_available = False
                    conflict_reason = f"Your reservation ends after operating hours ({operating_hours['close'].strftime('%I:%M %p')})"
                
                # Check if total duration exceeds max
                if end_minutes - start_minutes > MAX_RESERVATION_HOURS * 60:
                    is_available = False
                    conflict_reason = f"Reservation exceeds maximum allowed duration ({MAX_RESERVATION_HOURS} hours)"
                
            except Exception as e:
                logger.error(f"Error checking operating hours: {e}")
                return jsonify({
                    'available': False,
                    'reason': "Error validating operating hours"
                })
            
            # Return the result
            return jsonify({
                'available': is_available,
                'reason': conflict_reason if not is_available else ""
            })
            
        except Exception as e:
            logger.error(f"Error checking time availability: {e}")
            return jsonify({
                'available': False,
                'reason': "Error validating times"
            })
    
    # Return all reservations for the date
    reservations = load_reservations()
    date_reservations = {}
    
    # Find all reservations for this date, regardless of room
    for key, reservation in reservations.items():
        if key.startswith(date) or reservation.get('details', {}).get('date') == date:
            date_reservations[key] = reservation
    
    if date_reservations:
        return jsonify(date_reservations)
    
    # Old format support
    if date in reservations:
        return jsonify(reservations[date])
        
    return jsonify({'error': 'Reservation not found'}), 404


@app.route('/api/hours', methods=['GET'])
def get_operating_hours():
    """Get the LRC operating hours"""
    # Simplified hours format - group weekdays with same hours
    formatted_hours = {
        "Monday-Saturday": "07:30 AM - 6:00 PM",
        "Sunday": "10:00 AM - 4:00 PM"
    }
    
    return jsonify({
        "hours": formatted_hours,
        "max_duration": MAX_RESERVATION_HOURS
    })


@app.route('/api/holidays', methods=['GET'])
def get_holidays():
    """Get all holidays"""
    holidays = load_holidays()
    
    # Get year parameter, default to current year
    year = request.args.get('year', str(dt.now().year))
    
    # If year not in holidays, return empty list
    if year not in holidays:
        return jsonify([])
    
    return jsonify(holidays[year])


@app.route('/api/holidays/<date_str>', methods=['GET'])
def check_holiday(date_str):
    """Check if a specific date is a holiday"""
    try:
        is_holiday_date, holiday_name = is_holiday(date_str)
        if is_holiday_date:
            return jsonify({
                'is_holiday': True,
                'holiday_name': holiday_name
            })
        else:
            return jsonify({
                'is_holiday': False
            })
    except Exception as e:
        logger.error(f"Error checking holiday: {e}")
        return jsonify({
            'error': 'Invalid date format. Use YYYY-M-D'
        }), 400


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
