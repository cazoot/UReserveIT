import os
import json
import datetime
import logging
from pathlib import Path
from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
from flask_cors import CORS
from flask_mail import Mail, Message
from flask_admin import Admin, BaseView, expose
from flask_admin.contrib.sqla import ModelView
from flask_login import LoginManager, UserMixin, login_required, login_user, logout_user, current_user
from datetime import time, datetime as dt, timedelta
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import DeclarativeBase
from werkzeug.security import generate_password_hash, check_password_hash

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Initialize Flask application
app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "default-dev-key")
CORS(app)

# Database setup
class Base(DeclarativeBase):
    pass

db = SQLAlchemy(model_class=Base)
# Database configuration 
# Create data directory if it doesn't exist
data_dir = os.path.join(os.getcwd(), 'data')
os.makedirs(data_dir, exist_ok=True)

# Configure SQLite database
sqlite_path = os.path.join(data_dir, 'lrc_database.db')
app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{sqlite_path}"

# SQLite engine options
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "connect_args": {"check_same_thread": False},
}
logger.info(f"Using SQLite database at: {sqlite_path}")

app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Log the database connection
logger.info(f"Database URI: {app.config['SQLALCHEMY_DATABASE_URI'].split('@')[-1]}")

# Initialize the app with the extension
db.init_app(app)

# Define database models
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256))
    is_admin = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

class Room(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    room_number = db.Column(db.String(10), unique=True, nullable=False)
    capacity = db.Column(db.Integer, default=10)
    description = db.Column(db.Text)
    is_active = db.Column(db.Boolean, default=True)
    reservations = db.relationship('Reservation', backref='room', lazy=True)

class Student(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    student_id = db.Column(db.String(20), nullable=False)
    email = db.Column(db.String(120))
    reservation_id = db.Column(db.Integer, db.ForeignKey('reservation.id'))
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

class Reservation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False)
    start_time = db.Column(db.Time, nullable=False)
    end_time = db.Column(db.Time, nullable=False)
    room_id = db.Column(db.Integer, db.ForeignKey('room.id'), nullable=False)
    email = db.Column(db.String(120), nullable=False)
    seats = db.Column(db.Integer, default=1)
    reservation_status = db.Column(db.String(20), default='active')
    timer_active = db.Column(db.Boolean, default=False)
    timer_start = db.Column(db.DateTime, nullable=True)
    timer_end = db.Column(db.DateTime, nullable=True)
    students = db.relationship('Student', backref='reservation', lazy=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def duration_minutes(self):
        if not self.start_time or not self.end_time:
            return 0
        
        start_minutes = self.start_time.hour * 60 + self.start_time.minute
        end_minutes = self.end_time.hour * 60 + self.end_time.minute
        return end_minutes - start_minutes
    
    def to_dict(self):
        return {
            'id': self.id,
            'date': self.date.strftime('%Y-%m-%d'),
            'room': self.room.room_number if self.room else str(self.room_id),
            'time': self.start_time.strftime('%H:%M'),
            'endTime': self.end_time.strftime('%H:%M'),
            'seats': self.seats,
            'email': self.email,
            'students': [{'name': s.name, 'studentId': s.student_id} for s in self.students],
            'created_at': self.created_at.isoformat(),
            'reservation_id': str(self.id),
            'duration_hours': round(self.duration_minutes() / 60, 1),
            'timer_active': self.timer_active,
            'timer_start': self.timer_start.isoformat() if self.timer_start else None,
            'timer_end': self.timer_end.isoformat() if self.timer_end else None
        }

class Holiday(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    date = db.Column(db.Date, nullable=False)
    year = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

# Mail configuration
app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = os.environ.get('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.environ.get('MAIL_PASSWORD')
mail = Mail(app)

# SendGrid API Key
SENDGRID_API_KEY = os.environ.get('SENDGRID_API_KEY')

# Login configuration
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Admin configuration
class ReservationsView(BaseView):
    @expose('/')
    @login_required
    def index(self):
        reservations = Reservation.query.all()
        return self.render('admin/reservations.html', reservations=reservations)

class RoomModelView(ModelView):
    @login_required
    def is_accessible(self):
        return current_user.is_authenticated and current_user.is_admin

class ReservationModelView(ModelView):
    @login_required
    def is_accessible(self):
        return current_user.is_authenticated and current_user.is_admin
    
    column_list = ['id', 'date', 'start_time', 'end_time', 'email', 'seats', 'timer_active']
    column_searchable_list = ['email']
    column_filters = ['date', 'room_id', 'timer_active']

class HolidayModelView(ModelView):
    @login_required
    def is_accessible(self):
        return current_user.is_authenticated and current_user.is_admin

class TimerView(BaseView):
    @expose('/')
    @login_required
    def index(self):
        active_timers = Reservation.query.filter_by(timer_active=True).all()
        return self.render('admin/timers.html', active_timers=active_timers)

# Initialize admin
admin = Admin(app, name='LRC Admin', template_mode='bootstrap3')
admin.add_view(RoomModelView(Room, db.session))
admin.add_view(ReservationModelView(Reservation, db.session))
admin.add_view(HolidayModelView(Holiday, db.session))
admin.add_view(TimerView(name='Active Timers', endpoint='timers'))
admin.add_view(ReservationsView(name='Legacy Reservations', endpoint='legacy_reservations'))

# Initialize database with default values
def init_db():
    # Create default admin user if it doesn't exist
    admin_user = User.query.filter_by(username='admin').first()
    if not admin_user:
        admin_password = os.environ.get('ADMIN_PASSWORD', 'admin')
        password_hash = generate_password_hash(admin_password)
        admin_user = User(
            username='admin',
            email='admin@example.com',
            password_hash=password_hash,
            is_admin=True
        )
        db.session.add(admin_user)
        db.session.commit()
        logger.info("Created default admin user")
    
    # Create default rooms if they don't exist
    if Room.query.count() == 0:
        rooms = [
            Room(room_number='1', capacity=10, description='Discussion Room 1'),
            Room(room_number='2', capacity=8, description='Discussion Room 2'),
            Room(room_number='3', capacity=12, description='Conference Room')
        ]
        db.session.add_all(rooms)
        db.session.commit()
        logger.info("Created default rooms")

# Create all tables and initialize default data
with app.app_context():
    db.create_all()
    init_db()

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

# Email sending functions
def send_confirmation_email(reservation_data):
    """Send a confirmation email using SendGrid or Flask-Mail"""
    try:
        # Get reservation data
        date = reservation_data.get('date', '')
        room = reservation_data.get('room', '')
        time_start = reservation_data.get('time', '')
        time_end = reservation_data.get('endTime', '')
        reservation_id = reservation_data.get('reservation_id', '')
        students = reservation_data.get('students', [])
        recipient_email = reservation_data.get('email', '')
        
        # Format students list
        students_text = ""
        students_html = ""
        for student in students:
            student_name = student.get('name', 'N/A')
            student_id = student.get('studentId', 'N/A')
            students_text += f"- {student_name} ({student_id})\n"
            students_html += f"<li>{student_name} ({student_id})</li>"
        
        # Create plain text email body
        text_body = f"""
        Your room reservation has been confirmed!
        
        Date: {date}
        Room: {room}
        Time: {time_start} - {time_end}
        Reservation ID: {reservation_id}
        
        Students:
        {students_text}
        
        Thank you for using the LRC Reservation System!
        """
        
        # Create HTML email body
        html_body = f"""
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .header {{ background-color: #008c44; color: white; padding: 20px; text-align: center; }}
                .content {{ padding: 20px; }}
                .reservation-details {{ background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0; }}
                .footer {{ background-color: #f5f5f5; padding: 10px; text-align: center; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>LRC Room Reservation Confirmation</h1>
            </div>
            <div class="content">
                <p>Your room reservation has been confirmed!</p>
                
                <div class="reservation-details">
                    <p><strong>Date:</strong> {date}</p>
                    <p><strong>Room:</strong> {room}</p>
                    <p><strong>Time:</strong> {time_start} - {time_end}</p>
                    <p><strong>Reservation ID:</strong> {reservation_id}</p>
                    
                    <p><strong>Students:</strong></p>
                    <ul>
                        {students_html}
                    </ul>
                </div>
                
                <p>Thank you for using the LRC Reservation System!</p>
            </div>
            <div class="footer">
                <p>OLFU Learning Resource Center</p>
            </div>
        </body>
        </html>
        """
        
        # Check if SendGrid API key is available
        if SENDGRID_API_KEY:
            # Use SendGrid to send email
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import Mail, Email, To, Content, MimeType

            message = Mail(
                from_email=Email('lrc@olfu.edu.ph'),
                to_emails=To(recipient_email),
                subject='LRC Room Reservation Confirmation'
            )
            message.content = [
                Content(MimeType.text, text_body),
                Content(MimeType.html, html_body)
            ]
            
            sendgrid_client = SendGridAPIClient(SENDGRID_API_KEY)
            response = sendgrid_client.send(message)
            
            logger.debug(f"SendGrid confirmation email sent to {recipient_email} with status code {response.status_code}")
            return True
        else:
            # Fall back to Flask-Mail
            try:
                msg = Message(
                    'LRC Room Reservation Confirmation',
                    sender=app.config['MAIL_USERNAME'],
                    recipients=[recipient_email]
                )
                
                msg.body = text_body
                msg.html = html_body
                
                mail.send(msg)
                logger.debug(f"Flask-Mail confirmation email sent to {recipient_email}")
                return True
            except Exception as e:
                logger.error(f"Failed to send Flask-Mail confirmation email: {e}")
                return False
                
    except Exception as e:
        logger.error(f"Failed to send confirmation email: {e}")
        return False

# Utility functions
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
        
        # Check database for holidays
        holiday_date = date_obj.date()
        holiday = Holiday.query.filter_by(date=holiday_date).first()
        if holiday:
            return True, holiday.name
            
        # Legacy check in JSON file
        year_str = str(date_obj.year)
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

# Routes
@app.route('/')
def index():
    """Render the main page"""
    return render_template('index.html')

@app.route('/timer')
def timer_page():
    """Render the timer page"""
    return render_template('timer.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        # If no users exist, create an admin user
        if User.query.count() == 0:
            admin_user = User(
                username=os.environ.get('ADMIN_USERNAME', 'admin'),
                email=os.environ.get('ADMIN_EMAIL', 'admin@example.com'),
                password_hash=generate_password_hash(os.environ.get('ADMIN_PASSWORD', 'admin')),
                is_admin=True
            )
            db.session.add(admin_user)
            db.session.commit()
        
        # Check if user exists and password is correct
        user = User.query.filter_by(username=username).first()
        if user and check_password_hash(user.password_hash, password):
            login_user(user)
            return redirect('/admin')
    
    return render_template('admin/login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect('/')

@app.route('/api/reservations', methods=['GET'])
def get_reservations():
    """Get all reservations"""
    # Try to get reservations from the database
    db_reservations = Reservation.query.all()
    result = {}
    
    if db_reservations:
        # Convert database reservations to the legacy format
        for reservation in db_reservations:
            key = f"{reservation.date.strftime('%Y-%m-%d')}-room{reservation.room.room_number}"
            result[key] = {
                'status': reservation.reservation_status,
                'details': reservation.to_dict()
            }
    else:
        # If no database records, fall back to the legacy JSON file
        result = load_reservations()
        
    return jsonify(result)

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
    
    # Get or create the room in the database
    room = Room.query.filter_by(room_number=data['room']).first()
    if not room:
        room = Room(room_number=data['room'], capacity=10)
        db.session.add(room)
        db.session.commit()
    
    # Create a new database reservation
    try:
        reservation = Reservation(
            date=reservation_date.date(),
            start_time=start_time,
            end_time=end_time,
            room_id=room.id,
            email=data['email'],
            seats=int(data['seats']),
            reservation_status='active',
            timer_active=False
        )
        db.session.add(reservation)
        db.session.flush()  # Get ID without committing
        
        # Add students to the reservation
        for student_data in data['students']:
            student = Student(
                name=student_data['name'],
                student_id=student_data['studentId'],
                email=data['email'],
                reservation_id=reservation.id
            )
            db.session.add(student)
        
        # Commit changes
        db.session.commit()
        
        # Create a reservation ID
        reservation_id = str(reservation.id)
        
        # Add creation timestamp
        data['created_at'] = datetime.datetime.now().isoformat()
        data['reservation_id'] = reservation_id
        
        # Add reservation duration
        data['duration_hours'] = duration_hours
        
        # Create a unique key for the reservation that includes the room
        reservation_key = f"{data['date']}-room{data['room']}"
        
        # Add the reservation to the legacy system
        reservations[reservation_key] = {
            'status': 'owned',
            'details': data
        }
        
        # Save the updated reservations to JSON for legacy support
        save_reservations(reservations)
        
        # Send confirmation email
        send_confirmation_email(data)
            
        return jsonify({'success': True, 'reservation_id': reservation_id}), 201
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating reservation: {e}")
        return jsonify({'error': 'Failed to create reservation'}), 500

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
                    open_time_str = operating_hours['open'].strftime('%I:%M %p')
                    conflict_reason = f"Selected start time is before opening hours. The LRC opens at {open_time_str} on this day."
                    
                if end_minutes > close_minutes:
                    is_available = False
                    close_time_str = operating_hours['close'].strftime('%I:%M %p')
                    conflict_reason = f"Selected end time is after closing hours. The LRC closes at {close_time_str} on this day."
                    
                # Check if duration is within max hours
                if end_minutes - start_minutes > MAX_RESERVATION_HOURS * 60:
                    is_available = False
                    conflict_reason = f"Reservation cannot exceed {MAX_RESERVATION_HOURS} hours."
                    
            except (ValueError, IndexError) as e:
                logger.error(f"Error parsing date/time: {e}")
                is_available = False
                conflict_reason = "Invalid date/time format."
                
            return jsonify({
                'available': is_available,
                'reason': conflict_reason if not is_available else "Time slot is available for booking."
            })
                
        except (ValueError, IndexError) as e:
            logger.error(f"Error parsing time: {e}")
            return jsonify({
                'available': False,
                'reason': 'Invalid time format. Use HH:MM.'
            })
    
    # Try to get reservations from the database first
    try:
        year, month, day = map(int, date.split('-'))
        query_date = dt(year, month, day).date()
        
        db_reservations = Reservation.query.filter_by(date=query_date).all()
        if db_reservations:
            result = {}
            for res in db_reservations:
                key = f"{date}-room{res.room.room_number}"
                result[key] = {
                    'status': res.reservation_status,
                    'details': res.to_dict()
                }
            return jsonify(result)
    except Exception as e:
        logger.error(f"Error querying database: {e}")
    
    # If no database records or an error occurred, fall back to the legacy JSON
    reservations = load_reservations()
    filtered_reservations = {k: v for k, v in reservations.items() if k.startswith(date)}
    
    return jsonify(filtered_reservations)


@app.route('/api/hours', methods=['GET'])
def get_operating_hours():
    """Get the LRC operating hours"""
    hours = {
        "Monday-Saturday": "07:30 AM - 6:00 PM",
        "Sunday": "10:00 AM - 4:00 PM"
    }
    return jsonify(hours)

@app.route('/api/holidays', methods=['GET'])
def get_holidays():
    """Get all holidays"""
    # Try to get holidays from the database first
    db_holidays = Holiday.query.all()
    if db_holidays:
        result = {}
        for holiday in db_holidays:
            year_str = str(holiday.year)
            if year_str not in result:
                result[year_str] = []
                
            result[year_str].append({
                'name': holiday.name,
                'date': holiday.date.strftime('%Y-%m-%d')
            })
        return jsonify(result)
        
    # If no database records, fall back to the legacy JSON
    return jsonify(load_holidays())

@app.route('/api/holidays/<date_str>', methods=['GET'])
def check_holiday(date_str):
    """Check if a specific date is a holiday"""
    is_holiday_date, holiday_name = is_holiday(date_str)
    
    if is_holiday_date:
        return jsonify({
            "is_holiday": True,
            "name": holiday_name
        })
    else:
        return jsonify({"is_holiday": False})

@app.route('/api/timer', methods=['POST'])
def timer_action():
    """Start or stop timer for a reservation"""
    data = request.get_json()
    
    if not data or 'reservation_id' not in data or 'action' not in data:
        return jsonify({'error': 'Missing required fields'}), 400
    
    reservation_id = data['reservation_id']
    action = data['action']
    
    if action not in ['start', 'stop']:
        return jsonify({'error': 'Invalid action. Use "start" or "stop"'}), 400
    
    try:
        # Find the reservation in the database
        reservation = Reservation.query.get(int(reservation_id))
        
        if not reservation:
            return jsonify({'error': 'Reservation not found'}), 404
        
        if action == 'start':
            # Start the timer
            reservation.timer_active = True
            reservation.timer_start = datetime.datetime.now()
            reservation.timer_end = None
            db.session.commit()
            
            return jsonify({
                'success': True,
                'message': 'Timer started',
                'start_time': reservation.timer_start.isoformat()
            })
        else:
            # Stop the timer
            if not reservation.timer_active:
                return jsonify({'error': 'Timer not active for this reservation'}), 400
                
            reservation.timer_active = False
            reservation.timer_end = datetime.datetime.now()
            
            # Calculate duration
            duration = reservation.timer_end - reservation.timer_start
            duration_minutes = duration.total_seconds() / 60
            
            db.session.commit()
            
            return jsonify({
                'success': True,
                'message': 'Timer stopped',
                'start_time': reservation.timer_start.isoformat(),
                'end_time': reservation.timer_end.isoformat(),
                'duration_minutes': duration_minutes
            })
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error processing timer action: {e}")
        return jsonify({'error': str(e)}), 500

# Create the database tables
with app.app_context():
    db.create_all()
    
    # Check if rooms exist, if not create them
    if Room.query.count() == 0:
        room1 = Room(room_number="1", description="Discussion Room 1", capacity=10)
        room2 = Room(room_number="2", description="Discussion Room 2", capacity=10)
        db.session.add(room1)
        db.session.add(room2)
        db.session.commit()
        logger.info("Created default rooms")
    
    # Check if admin user exists, if not create one
    if User.query.filter_by(is_admin=True).count() == 0:
        admin_user = User(
            username=os.environ.get('ADMIN_USERNAME', 'admin'),
            email=os.environ.get('ADMIN_EMAIL', 'admin@example.com'),
            password_hash=generate_password_hash(os.environ.get('ADMIN_PASSWORD', 'admin')),
            is_admin=True
        )
        db.session.add(admin_user)
        db.session.commit()
        logger.info("Created default admin user")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)