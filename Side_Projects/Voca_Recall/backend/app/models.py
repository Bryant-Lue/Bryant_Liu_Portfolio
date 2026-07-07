from datetime import datetime, timedelta
import secrets
import pytz
from sqlalchemy.ext.mutable import MutableDict, MutableList
from . import db, bcrypt

class User(db.Model):
    """User model"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    first_name = db.Column(db.String(50), nullable=False)
    last_name = db.Column(db.String(50), nullable=False)
    role = db.Column(db.String(20), default='user', nullable=False)  # user, developer, admin
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)
    
    # Relationships
    databases = db.relationship('NotionDatabase', backref='user', lazy=True, cascade='all, delete-orphan')
    notion_tokens = db.relationship('NotionToken', backref='user', lazy=True, cascade='all, delete-orphan')
    email_settings = db.relationship('EmailSettings', backref='user', lazy=True, uselist=False, cascade='all, delete-orphan')
    email_services = db.relationship('EmailService', backref='user', lazy=True, cascade='all, delete-orphan')
    password_reset_tokens = db.relationship('PasswordResetToken', backref='user', lazy=True, cascade='all, delete-orphan')
    
    def set_password(self, password):
        """Hash and set password"""
        self.password_hash = bcrypt.generate_password_hash(password).decode('utf-8')
    
    def check_password(self, password):
        """Check password hash"""
        return bcrypt.check_password_hash(self.password_hash, password)
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'email': self.email,
            'first_name': self.first_name,
            'last_name': self.last_name,
            'role': self.role,
            'created_at': self.created_at.isoformat() + 'Z',
            'is_active': self.is_active
        }

    def generate_password_reset_token(self):
        """Generate a password reset token"""
        # Invalidate any existing tokens
        existing_tokens = PasswordResetToken.query.filter_by(user_id=self.id, is_used=False).all()
        for token in existing_tokens:
            token.is_used = True
        
        # Create new token
        reset_token = PasswordResetToken(
            user_id=self.id,
            token=secrets.token_urlsafe(32),
            expires_at=datetime.utcnow() + timedelta(hours=1)  # Token valid for 1 hour
        )
        db.session.add(reset_token)
        db.session.commit()
        
        return reset_token.token

    @staticmethod
    def verify_password_reset_token(token):
        """Verify password reset token and return user if valid"""
        reset_token = PasswordResetToken.query.filter_by(
            token=token, 
            is_used=False
        ).first()
        
        if not reset_token or reset_token.expires_at < datetime.utcnow():
            return None
        
        return reset_token.user

class PasswordResetToken(db.Model):
    """Password reset token model"""
    __tablename__ = 'password_reset_tokens'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    token = db.Column(db.String(255), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=False)
    is_used = db.Column(db.Boolean, default=False)
    used_at = db.Column(db.DateTime, nullable=True)
    
    def mark_as_used(self):
        """Mark token as used"""
        self.is_used = True
        self.used_at = datetime.utcnow()
        db.session.commit()
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'token': self.token,
            'created_at': self.created_at.isoformat() + 'Z',
            'expires_at': self.expires_at.isoformat() + 'Z',
            'is_used': self.is_used,
            'used_at': self.used_at.isoformat() + 'Z' if self.used_at else None
        }

class NotionToken(db.Model):
    """Notion API token model for storing user tokens"""
    __tablename__ = 'notion_tokens'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    token = db.Column(db.String(255), nullable=False)  # Encrypted token
    token_name = db.Column(db.String(100), nullable=True)  # Optional label for the token
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    databases = db.relationship('NotionDatabase', backref='notion_token', lazy=True)
    
    def to_dict(self, include_token=False):
        """Convert to dictionary"""
        result = {
            'id': self.id,
            'token_name': self.token_name,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() + 'Z',
            'database_count': len(self.databases)
        }
        if include_token:
            result['token'] = self.token
        return result

class NotionDatabase(db.Model):
    """Notion database model"""
    __tablename__ = 'notion_databases'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    token_id = db.Column(db.Integer, db.ForeignKey('notion_tokens.id'), nullable=True)  # Link to stored token
    database_id = db.Column(db.String(255), nullable=True)  # Legacy database ID, now optional
    data_source_id = db.Column(db.String(255), nullable=True)  # New Notion data source ID
    database_name = db.Column(db.String(255), nullable=False)
    database_url = db.Column(db.String(500), nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    email_services = db.relationship('EmailService', backref='database', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'database_id': self.database_id,
            'data_source_id': self.data_source_id,
            'database_name': self.database_name,
            'database_url': self.database_url,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() + 'Z',
            'token_id': self.token_id,
            'email_services_count': len(self.email_services) if hasattr(self, 'email_services') else 0
        }

class EmailService(db.Model):
    """Email service model - service-level email settings linked to databases"""
    __tablename__ = 'email_services'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    database_id = db.Column(db.Integer, db.ForeignKey('notion_databases.id'), nullable=False)
    
    # Service identification
    service_name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=True)
    
    # Email scheduling settings
    send_time = db.Column(db.Time, default=datetime.strptime('09:00', '%H:%M').time())
    timezone = db.Column(db.String(50), default='UTC')
    frequency = db.Column(db.String(20), default='daily')  # daily, weekly, custom
    
    # Vocabulary settings
    vocabulary_count = db.Column(db.Integer, default=10)
    selection_method = db.Column(db.String(20), default='random')  # random, latest, date_range

    # Preferred email client - controls how the email body is formatted.
    # apple_mail supports interactive <details> toggles; gmail/outlook do not,
    # so for those clients the primary column is rendered in bold instead.
    email_client = db.Column(db.String(20), default='apple_mail')  # apple_mail, gmail, outlook
    
    # Date range settings (for selection_method='date_range')
    date_range_start = db.Column(db.Date, nullable=True)
    date_range_end = db.Column(db.Date, nullable=True)
    
    # Status
    is_active = db.Column(db.Boolean, default=True)
    status = db.Column(db.String(20), default='PENDING') # PENDING, PROCESSING, COMPLETED, FAILED
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_sent_at = db.Column(db.DateTime, nullable=True)
    next_run_at = db.Column(db.DateTime, nullable=True)

    # column selection settings (e.g. which columns to include in the email)
    column_selection = db.Column(MutableList.as_mutable(db.JSON), default=list)
    
    def calculate_next_run(self, from_time=None):
        """
        Calculate next run time in UTC based on schedule.
        Returns a naive UTC datetime object suitable for DB storage.
        """
        if not from_time:
            from_time = datetime.utcnow()
            
        # Ensure from_time is aware (UTC) for usage with pytz, or handle naive consistently
        if from_time.tzinfo is None:
            from_time = pytz.utc.localize(from_time)
            
        try:
            tz = pytz.timezone(self.timezone)
        except pytz.UnknownTimeZoneError:
            tz = pytz.UTC
            
        # Convert reference time to service local time
        now_local = from_time.astimezone(tz)
        
        # Base candidate: same date as now_local, but with configured time
        target_local = now_local.replace(
            hour=self.send_time.hour, 
            minute=self.send_time.minute, 
            second=0, 
            microsecond=0
        )
        
        if self.frequency == 'daily':
            if target_local <= now_local:
                target_local += timedelta(days=1)
                
        elif self.frequency == 'weekly':
            # Default: Monday (0)
            target_weekday = 0 
            current_weekday = target_local.weekday()
            days_ahead = (target_weekday - current_weekday) % 7
            target_local += timedelta(days=days_ahead)
            
            if target_local <= now_local:
                target_local += timedelta(weeks=1)
                
        elif self.frequency == 'monthly':
            # Default: 1st of month
            target_local = target_local.replace(day=1)
            if target_local <= now_local:
                # Next month
                if target_local.month == 12:
                    target_local = target_local.replace(year=target_local.year + 1, month=1)
                else:
                    target_local = target_local.replace(month=target_local.month + 1)
        
        # Convert back to UTC and make naive
        return target_local.astimezone(pytz.utc).replace(tzinfo=None)

    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'database_id': self.database_id,
            'service_name': self.service_name,
            'description': self.description,
            'send_time': self.send_time.strftime('%H:%M'),
            'timezone': self.timezone,
            'frequency': self.frequency,
            'vocabulary_count': self.vocabulary_count,
            'selection_method': self.selection_method,
            'email_client': self.email_client,
            'date_range_start': self.date_range_start.isoformat() if self.date_range_start else None,
            'date_range_end': self.date_range_end.isoformat() if self.date_range_end else None,
            'is_active': self.is_active,
            'status': self.status,
            'last_sent_at': self.last_sent_at.isoformat() + 'Z' if self.last_sent_at else None,
            'next_run_at': self.next_run_at.isoformat() + 'Z' if self.next_run_at else None,
            'column_selection': self.column_selection,
            'created_at': self.created_at.isoformat() + 'Z'
        }

class EmailSettings(db.Model):
    """Email settings model - DEPRECATED: Use EmailService instead for service-level settings"""
    __tablename__ = 'email_settings'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    vocabulary_count = db.Column(db.Integer, default=10)
    send_time = db.Column(db.Time, default=datetime.strptime('09:00', '%H:%M').time())
    timezone = db.Column(db.String(50), default='UTC')
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'vocabulary_count': self.vocabulary_count,
            'send_time': self.send_time.strftime('%H:%M'),
            'timezone': self.timezone,
            'is_active': self.is_active
        }

class EmailLog(db.Model):
    """Email log model for tracking sent emails"""
    __tablename__ = 'email_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    sent_at = db.Column(db.DateTime, default=datetime.utcnow)
    vocabulary_items = db.Column(db.JSON)  # Store the vocabulary items sent
    status = db.Column(db.String(20), default='sent')  # sent, failed
    error_message = db.Column(db.Text, nullable=True)
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'sent_at': self.sent_at.isoformat() + 'Z' if self.sent_at else None,
            'vocabulary_items': self.vocabulary_items,
            'status': self.status,
            'error_message': self.error_message
        }
