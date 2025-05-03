import datetime
from flask_login import UserMixin

# Will be set by app.py
db = None

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
            'room': str(self.room_id),
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