from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from notion_client import Client
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import random
from datetime import date, datetime
from celery.schedules import crontab
import pytz
import re
from typing import Any, TypedDict
from .models import User, NotionDatabase, NotionToken, EmailService, EmailLog, db
from . import celery
from .logging_config import get_logger
from .middleware import log_api_call, log_function_call

email_bp = Blueprint('email', __name__)
logger = get_logger(__name__)


class ColumnSelectionItem(TypedDict, total=False):
    name: str
    type: str


ColumnSelection = list[ColumnSelectionItem | str]


# Supported email clients. Apple Mail renders the interactive <details>/<summary>
# toggles; Gmail and Outlook strip them, so for those clients we fall back to a
# static layout where the primary column (the vocabulary word) is shown in bold.
EMAIL_CLIENTS = ('apple_mail', 'gmail', 'outlook')
DEFAULT_EMAIL_CLIENT = 'apple_mail'


def normalize_email_client(email_client: str | None) -> str:
    """Return a valid email client identifier, falling back to the default."""
    if email_client and email_client in EMAIL_CLIENTS:
        return email_client
    return DEFAULT_EMAIL_CLIENT


def format_vocabulary_in_sentence(sentence, vocabulary_word):
    """
    Format the vocabulary word in the sentence with bold and italic HTML tags.
    Returns the sentence with the vocabulary word formatted as <strong><em>word</em></strong>
    """
    if not sentence or not vocabulary_word:
        return sentence
    
    # Escape special regex characters in the vocabulary word
    escaped_word = re.escape(vocabulary_word)
    
    # Create a case-insensitive pattern that matches the word (and its variations)
    # \b ensures we match whole words only
    pattern = re.compile(r'\b(' + escaped_word + r'(?:s|es|ed|ing)?)\b', re.IGNORECASE)
    
    # Replace with bold and italic formatting
    formatted_sentence = pattern.sub(r'<strong><em>\1</em></strong>', sentence)
    
    return formatted_sentence

@log_function_call("Email sending")
def send_email(to_email, subject, html_content, text_content=None):
    """Send email using SMTP"""
    try:
        logger.info(f"Preparing to send email to {to_email} with subject: {subject}")
        
        # Check if SMTP is configured
        smtp_user = current_app.config.get('SMTP_USER')
        smtp_password = current_app.config.get('SMTP_PASSWORD')
        
        if not smtp_user or not smtp_password:
            logger.warning("SMTP credentials not configured, cannot send email")
            return False, "SMTP credentials not configured"
        
        # Ensure smtp_user is a string (decode if bytes)
        if isinstance(smtp_user, bytes):
            smtp_user = smtp_user.decode('utf-8')
        else:
            smtp_user = str(smtp_user)
        
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = smtp_user
        msg['To'] = to_email
        
        # Add text and HTML parts
        if text_content:
            text_part = MIMEText(text_content, 'plain')
            msg.attach(text_part)
        
        html_part = MIMEText(html_content, 'html')
        msg.attach(html_part)
        
        # Ensure password is a string (decode if bytes)
        if isinstance(smtp_password, bytes):
            password = smtp_password.decode('utf-8')
        elif smtp_password:
            password = str(smtp_password)
        else:
            password = ""
        
        # Send email
        with smtplib.SMTP(current_app.config['SMTP_HOST'], current_app.config['SMTP_PORT']) as server:
            if current_app.config['SMTP_USE_TLS']:
                server.starttls()
            server.login(smtp_user, password)
            server.send_message(msg)
        
        logger.info(f"Email sent successfully to {to_email}")
        return True, None
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {str(e)}")
        return False, str(e)

@log_function_call("Notion vocabulary fetch")
def get_vocabulary_from_notion(api_key, database_id=None, count=10, selection_method='random', date_range_start=None, date_range_end=None, data_source_id=None):
    """
    Get vocabulary items from Notion database using specified selection method
    
    Args:
        api_key: Notion API key
        database_id: Notion database ID (legacy)
        count: Number of items to fetch
        selection_method: 'random', 'latest', or 'date_range'
        date_range_start: Start date for date_range method (datetime.date object)
        date_range_end: End date for date_range method (datetime.date object)
        data_source_id: Notion data source ID
    """
    from notion_client.helpers import collect_paginated_api
    try:
        target_id = data_source_id or database_id
        if data_source_id:
            logger.info(f"Fetching {count} vocabulary items from Notion data source {target_id} using {selection_method} method")
        else:
            logger.info(f"Fetching {count} vocabulary items from Notion database {target_id} using {selection_method} method")
        
        notion = Client(auth=api_key)
        
        # Build query filters based on selection method
        query_params = {}
        if data_source_id:
            query_params['data_source_id'] = data_source_id
        else:
            query_params['database_id'] = database_id
        
        # For latest selection, sort by created time descending
        if selection_method == 'latest':
            query_params['sorts'] = [{'timestamp': 'created_time', 'direction': 'descending'}]
        
        # For date_range selection, filter by created date
        if selection_method == 'date_range' and (date_range_start or date_range_end):
            filters = []
            if date_range_start:
                filters.append({
                    'timestamp': 'created_time',
                    'created_time': {'on_or_after': date_range_start.isoformat()}
                })
            if date_range_end:
                filters.append({
                    'timestamp': 'created_time',
                    'created_time': {'on_or_before': date_range_end.isoformat()}
                })
            
            if len(filters) > 1:
                query_params['filter'] = {'and': filters}
            elif len(filters) == 1:
                query_params['filter'] = filters[0]
        
        # Get items from Notion using pagination helper to overcome 100-item limit
        if data_source_id:
            items = collect_paginated_api(
                notion.data_sources.query,
                **query_params
            )
        else:
            items = collect_paginated_api(
                notion.databases.query,
                **query_params
            )
        
        if not items:
            logger.warning(f"No items found in Notion target {target_id}")
            return []
        
        logger.info(f"Found {len(items)} total items in database")
        
        # Select items based on method
        if selection_method == 'random':
            # Randomly select items
            selected_items = random.sample(items, min(count, len(items)))
        elif selection_method == 'latest':
            # Take the first N items (already sorted by created_time descending)
            selected_items = items[:min(count, len(items))]
        elif selection_method == 'date_range':
            # For date range, randomly select from filtered results
            selected_items = random.sample(items, min(count, len(items)))
        else:
            # Default to random
            selected_items = random.sample(items, min(count, len(items)))
        
        vocabulary_items = []
        for item in selected_items:
            properties = item.get('properties', {})
            item_data = {}
            
            # Extract common vocabulary fields
            for prop_name, prop_value in properties.items():
                prop_type = prop_value.get('type')
                
                if prop_type == 'title':
                    title = prop_value.get('title', [])
                    # Concatenate all title segments to handle formatted text
                    item_data[prop_name] = ''.join([segment.get('plain_text', '') for segment in title]) if title else ''
                elif prop_type == 'rich_text':
                    rich_text = prop_value.get('rich_text', [])
                    # Concatenate all rich text segments to handle links, bold, italic, etc.
                    item_data[prop_name] = ''.join([segment.get('plain_text', '') for segment in rich_text]) if rich_text else ''
                elif prop_type == 'select':
                    select = prop_value.get('select')
                    item_data[prop_name] = select.get('name', '') if select else ''
                elif prop_type == 'multi_select':
                    multi_select = prop_value.get('multi_select', [])
                    if not multi_select: continue
                    item_data[prop_name] = [option.get('name', '') for option in multi_select]
                elif prop_type == 'url':
                    item_data[prop_name] = prop_value.get('url', '')
                elif prop_type == 'email':
                    item_data[prop_name] = prop_value.get('email', '')
                elif prop_type == 'phone_number':
                    item_data[prop_name] = prop_value.get('phone_number', '')
                elif prop_type == 'number':
                    item_data[prop_name] = prop_value.get('number', '')
                elif prop_type == 'checkbox':
                    item_data[prop_name] = prop_value.get('checkbox', False)
                elif prop_type == 'date':
                    date_obj = prop_value.get('date')
                    if date_obj:
                        item_data[prop_name] = date_obj.get('start', '')
                    else:
                        item_data[prop_name] = ''
                elif prop_type == 'created_time':
                    # Created time property - returns ISO 8601 datetime string
                    item_data[prop_name] = prop_value.get('created_time', '')
                elif prop_type == 'last_edited_time':
                    # Last edited time property - returns ISO 8601 datetime string
                    item_data[prop_name] = prop_value.get('last_edited_time', '')
                elif prop_type == 'unique_id':
                    # Unique ID property - returns a number or prefix-number combination
                    unique_id = prop_value.get('unique_id', {})
                    if unique_id:
                        prefix = unique_id.get('prefix')
                        number = unique_id.get('number')
                        if prefix:
                            item_data[prop_name] = f"{prefix}-{number}" if number else prefix
                        else:
                            item_data[prop_name] = str(number) if number else ''
                    else:
                        item_data[prop_name] = ''
            
            vocabulary_items.append(item_data)
        
        logger.info(f"Successfully fetched {len(vocabulary_items)} vocabulary items")
        return vocabulary_items
        
    except Exception as e:
        logger.error(f"Error fetching vocabulary from Notion target {data_source_id or database_id}: {str(e)}")
        return []

def render_item_fields(
    item: dict[str, Any],
    word: str,
    primary_key: str,
    column_selection: ColumnSelection,
) -> str:
    """Render the detail fields (everything except the primary column) for one item."""
    fields_html = ""
    for col in column_selection:
        col_name = col.get('name') if isinstance(col, dict) else col
        if not col_name or not isinstance(col_name, str):
            continue
        if col_name == primary_key:
            continue

        val = item.get(col_name)
        if isinstance(val, list):
            str_val = ", ".join(str(v) for v in val)
        else:
            str_val = str(val) if val is not None else ''

        if not str_val.strip():
            continue

                # Special handling for "Sentence" column (case-insensitive)
        if 'sentence' in col_name.lower():
            sentences = [line for line in str_val.split('\\n') if line.strip()]
            fields_html += f"""
                        <div class="field-section" style="font-size: 16px; color: #555; margin-bottom: 15px; line-height: 1.8;">
                            <div class="field-label" style="font-weight: bold; color: #764ba2; margin-bottom: 5px;">{col_name}:</div>
            """
            if len(sentences) > 1:
                fields_html += "<ul style='margin: 5px 0; padding-left: 20px;'>"
                for sent in sentences:
                    formatted_sent = format_vocabulary_in_sentence(sent, word)
                    fields_html += f"<li style='margin: 3px 0;'>{formatted_sent}</li>"
                fields_html += "</ul>"
            else:
                formatted_sentence = format_vocabulary_in_sentence(str_val, word)
                fields_html += formatted_sentence
            fields_html += "</div>"
        else:
            # Link detection
            display_val = str_val
            if str_val.startswith(('http://', 'https://')):
                display_val = f'<a href="{str_val}" target="_blank" style="color: #667eea; text-decoration: none;">{str_val}</a>'

            fields_html += f"""
                        <div class="field-section" style="font-size: 16px; color: #555; margin-bottom: 15px; line-height: 1.8;">
                            <div class="field-label" style="font-weight: bold; color: #764ba2; margin-bottom: 5px;">{col_name}:</div>
                            {display_val}
                        </div>
            """
    return fields_html


@log_function_call("Email content creation")
def create_email_content(
    vocabulary_items: list[dict[str, Any]],
    user_name: str,
    database_url: str | None = None,
    column_selection: ColumnSelection | None = None,
    email_client: str | None = None,
) -> str:
    """Create HTML email content tailored to the user's preferred email client.

    Apple Mail supports interactive <details>/<summary> flashcards, so words stay
    collapsed until tapped. Gmail and Outlook strip those toggles, so the content
    is rendered statically with the vocabulary word shown in bold.
    """
    email_client = normalize_email_client(email_client)
    supports_toggles = email_client == 'apple_mail'
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
            .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
            .instruction {{ background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; color: #1565c0; text-align: center; }}
            .vocabulary-item {{ background: white; margin: 15px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden; }}
            details {{ cursor: pointer; }}
            summary {{ 
                font-size: 20px; 
                font-weight: bold; 
                color: #2c3e50; 
                padding: 20px;
                background: linear-gradient(to right, #f8f9fa 0%, #ffffff 100%);
                list-style: none;
                user-select: none;
                transition: background-color 0.3s ease;
            }}
            .vocabulary-word {{
                font-size: 20px;
                font-weight: bold;
                color: #2c3e50;
                padding: 20px;
                background: linear-gradient(to right, #f8f9fa 0%, #ffffff 100%);
                border-bottom: 2px solid #667eea;
            }}
            summary::-webkit-details-marker {{ display: none; }}
            summary::before {{
                content: "▶ ";
                display: inline-block;
                transition: transform 0.3s ease;
                margin-right: 8px;
                color: #667eea;
            }}
            details[open] summary::before {{
                transform: rotate(90deg);
            }}
            details[open] summary {{
                background: linear-gradient(to right, #e8eaf6 0%, #f3e5f5 100%);
                border-bottom: 2px solid #667eea;
            }}
            summary:hover {{
                background: linear-gradient(to right, #e8eaf6 0%, #f3e5f5 100%);
            }}
            .flashcard-content {{ 
                padding: 20px;
                animation: slideDown 0.3s ease-out;
            }}
            @keyframes slideDown {{
                from {{ opacity: 0; transform: translateY(-10px); }}
                to {{ opacity: 1; transform: translateY(0); }}
            }}
            .field-section {{ 
                font-size: 16px; 
                color: #555; 
                margin-bottom: 15px;
                line-height: 1.8;
            }}
            .field-label {{
                font-weight: bold;
                color: #764ba2;
                margin-bottom: 5px;
            }}
            .database-link {{
                background: #f8f9fa;
                padding: 15px;
                border-radius: 8px;
                margin-top: 20px;
                text-align: center;
            }}
            .database-link a {{
                color: #667eea;
                text-decoration: none;
                font-weight: bold;
                font-size: 23px;
            }}
            .database-link a:hover {{
                text-decoration: underline;
            }}
            .footer {{ text-align: center; margin-top: 30px; color: #666; font-size: 14px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📚 Daily Vocabulary Recall</h1>
                <p style="font-size: 17px;">Hello {user_name}, here are your vocabulary words for today!</p>
            </div>
            <div class="content">
    """

    if supports_toggles:
        html_content += """
                <div class="instruction">
                    💡 <strong>Tip:</strong> Click or tap on any word to reveal its details!
                </div>
        """
    else:
        html_content += """
                <div class="instruction">
                    💡 <strong>Tip:</strong> Try to recall each word's meaning before reading its details!
                </div>
        """

    html_content += f"""
                <h2>Today's Vocabulary ({len(vocabulary_items)} words)</h2>
    """

    for i, item in enumerate(vocabulary_items, 1):
        word = ''
        
        # TODO
        # Enforce 'minimum one selection' rule
        # Use column_selection to determine content
        if not column_selection or len(column_selection) == 0:
            # If no columns selected, we cannot render meaningful content
            # In a production environment, this should be prevented by validation before this point
            continue

        # 1. Determine Title/Word (Summary)
        # Use the first column in the selection as the title
        primary_col = column_selection[0]
        # Handle object structure {name: '...', type: '...'} or just 'name' string
        primary_key = primary_col.get('name') if isinstance(primary_col, dict) else primary_col
        
        val = item.get(primary_key)
        if val and str(val).strip():
            word = str(val)
        else:
            word = "Untitled"

        # Render the detail fields shared by both layouts
        fields_html = render_item_fields(item, word, primary_key, column_selection)

        if supports_toggles:
            # Apple Mail: interactive collapsible flashcard
            html_content += f"""
            <div class="vocabulary-item">
                <details>
                    <summary>{i}. {word}</summary>
                    <div class="flashcard-content">
                        {fields_html}
                    </div>
                </details>
            </div>
            """
        else:
            # Gmail / Outlook: no toggle support, show the word in bold with details always visible
            html_content += f"""
            <div class="vocabulary-item" style="background: white; margin: 15px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden;">
                <div class="vocabulary-word" style="font-size: 20px; font-weight: bold; color: #2c3e50; padding: 20px; background-color: #f8f9fa; border-bottom: 2px solid #667eea;">{i}. <strong>{word}</strong></div>
                <div class="flashcard-content" style="padding: 20px;">
                    {fields_html}
                </div>
            </div>
            """

    # Add database link if provided
    if database_url:
        html_content += f"""
                <div class="database-link">
                    <span style="font-size: 23px;">📖</span> <a href="{database_url}" target="_blank">View Full Notion Database</a>
                </div>
        """
    
    html_content += """
            </div>
            <div class="footer">
                <p>Keep learning and expanding your vocabulary! 🚀</p>
                <p>This email was sent by Notion Email Vocabulary Recall</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return html_content

@email_bp.route('/send-test', methods=['POST'])
@jwt_required()
@log_api_call("Send test email")
def send_test_email():
    """Send a test email to the user"""
    try:
        current_user_id = int(get_jwt_identity())
        logger.info(f"Processing test email request for user {current_user_id}")
        
        user = User.query.get(current_user_id)
        
        if not user:
            logger.warning(f"User {current_user_id} not found for test email")
            return jsonify({'error': 'User not found'}), 404
        
        data: dict[str, Any] = request.get_json() or {}
        database_pk: int | None = data.get('database_pk')
        service_id: int | None = data.get('service_id')  # Support sending test using a service
        vocabulary_count: int = data.get('vocabulary_count', 5)
        selection_method: str = data.get('selection_method', 'random')
        date_range_start: str | None = data.get('date_range_start')
        date_range_end: str | None = data.get('date_range_end')
        column_selection: ColumnSelection | None = data.get('column_selection')
        email_client: str | None = data.get('email_client')

        # Parse date range if provided
        date_start: date | None = None
        date_end: date | None = None
        if date_range_start:
            try:
                from datetime import datetime as dt
                date_start = dt.strptime(date_range_start, '%Y-%m-%d').date()
            except ValueError:
                pass
        if date_range_end:
            try:
                from datetime import datetime as dt
                date_end = dt.strptime(date_range_end, '%Y-%m-%d').date()
            except ValueError:
                pass
        
        # Support sending via email service
        if service_id:
            from .models import EmailService
            service = EmailService.query.filter_by(
                id=service_id,
                user_id=current_user_id
            ).first()
            
            if not service:
                return jsonify({'error': 'Email service not found'}), 404
            
            database = NotionDatabase.query.get(service.database_id)
            if not database:
                return jsonify({'error': 'Database not found'}), 404
            
            # Use service settings
            vocabulary_count = service.vocabulary_count
            selection_method = service.selection_method
            date_start = service.date_range_start
            date_end = service.date_range_end
            column_selection = service.column_selection
            email_client = service.email_client
            
            if not database.token_id:
                return jsonify({'error': 'Database has no associated token'}), 400
            
            token = NotionToken.query.get(database.token_id)
            if not token or not token.is_active:
                return jsonify({'error': 'Token not found or inactive'}), 404
            
            api_key = token.token
            database_id = database.database_id
            data_source_id = database.data_source_id
            
        # Support both new (database_pk) and legacy (notion_api_key + database_id) methods
        elif database_pk:
            # New method: use stored database and token
            database = NotionDatabase.query.filter_by(
                id=database_pk,
                user_id=current_user_id
            ).first()
            
            if not database:
                return jsonify({'error': 'Database not found'}), 404
            
            if not database.token_id:
                return jsonify({'error': 'Database has no associated token. Please update the database configuration.'}), 400
            
            token = NotionToken.query.filter_by(
                id=database.token_id,
                user_id=current_user_id,
                is_active=True
            ).first()
            
            if not token:
                return jsonify({'error': 'Token not found or inactive'}), 404
            
            api_key = token.token
            database_id = database.database_id
            data_source_id = database.data_source_id
        else:
            # Legacy method: use provided API key and database ID
            api_key = data.get('notion_api_key')
            database_id = data.get('database_id')
            data_source_id = data.get('data_source_id')
            
            if not api_key or (not database_id and not data_source_id):
                return jsonify({'error': 'Either service_id, database_pk, or (notion_api_key and (database_id or data_source_id)) are required'}), 400
        
        # Get vocabulary items with selection method
        vocabulary_items = get_vocabulary_from_notion(
            api_key, 
            database_id=database_id, 
            count=vocabulary_count,
            selection_method=selection_method,
            date_range_start=date_start,
            date_range_end=date_end,
            data_source_id=data_source_id
        )
        
        if not vocabulary_items:
            return jsonify({'error': 'No vocabulary items found in the database'}), 400
        
        # Create Notion database URL (legacy behavior fallback)
        target_id_for_url = data_source_id or database_id
        database_url = f"https://www.notion.so/{target_id_for_url.replace('-', '')}" if target_id_for_url else ""
        
        # Create email content
        html_content = create_email_content(vocabulary_items, user.first_name, database_url, column_selection=column_selection, email_client=email_client)

        # Send email
        success, error = send_email(
            user.email,
            "Test: Daily Vocabulary Recall",
            html_content,
        )
        
        if not success:
            return jsonify({'error': 'Failed to send email', 'details': error}), 500
        
        # Log the email
        email_log = EmailLog(
            user_id=current_user_id,
            vocabulary_items=vocabulary_items,
            status='sent'
        )
        db.session.add(email_log)
        db.session.commit()
        
        return jsonify({
            'message': 'Test email sent successfully',
            'vocabulary_count': len(vocabulary_items)
        }), 200
        
    except Exception as e:
        logger.error(f"Failed to send test email for user {current_user_id}: {str(e)}")
        db.session.rollback()
        return jsonify({'error': 'Failed to send test email', 'details': str(e)}), 500

@email_bp.route('/logs', methods=['GET'])
@jwt_required()
@log_api_call("Get email logs")
def get_email_logs():
    """Get user's email logs"""
    try:
        current_user_id = int(get_jwt_identity())
        logger.info(f"Fetching email logs for user {current_user_id}")
        
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        
        logs = EmailLog.query.filter_by(user_id=current_user_id)\
            .order_by(EmailLog.sent_at.desc())\
            .paginate(page=page, per_page=per_page, error_out=False)
        
        return jsonify({
            'logs': [log.to_dict() for log in logs.items],
            'total': logs.total,
            'pages': logs.pages,
            'current_page': page
        }), 200
        
    except Exception as e:
        return jsonify({'error': 'Failed to get email logs', 'details': str(e)}), 500


@celery.task
def send_email_service_task(service_id):
    """
    Celery task to send vocabulary email based on EmailService configuration.
    This task is triggered by Celery Beat scheduler.
    
    Args:
        service_id: ID of the EmailService record
    
    Returns:
        bool: True if email sent successfully, False otherwise
    """
    try:
        with current_app.app_context():
            # Get the email service configuration
            service = EmailService.query.get(service_id)
            if not service or not service.is_active:
                logger.warning(f"Email service {service_id} not found or inactive")
                return False
            
            # Get the associated database
            database = NotionDatabase.query.get(service.database_id)
            if not database or not database.is_active:
                logger.warning(f"Database {service.database_id} not found or inactive")
                return False
            
            # Get the user
            user = User.query.get(database.user_id)
            if not user or not user.is_active:
                logger.warning(f"User {database.user_id} not found or inactive")
                return False
            
            logger.info(f"Processing email service: {service.service_name} (ID: {service_id}) for user: {user.email}")
            
            # Get the Notion API token
            if not database.token_id:
                logger.error(f"Database {database.id} has no associated token")
                return False
            
            token = NotionToken.query.get(database.token_id)
            if not token or not token.is_active:
                logger.error(f"Token {database.token_id} not found or inactive")
                return False
            
            # Get vocabulary from Notion based on selection method
            vocabulary_items = get_vocabulary_from_notion(
                api_key=token.token,
                database_id=database.database_id,
                count=service.vocabulary_count,
                selection_method=service.selection_method,
                date_range_start=service.date_range_start,
                date_range_end=service.date_range_end,
                data_source_id=database.data_source_id
            )
            
            if not vocabulary_items:
                logger.warning(f"No vocabulary items found for service {service_id}")
                return False
            
            logger.info(f"Retrieved {len(vocabulary_items)} vocabulary items for service {service_id}")
            
            # Create Notion database URL
            target_id_for_url = database.data_source_id or database.database_id
            database_url = f"https://www.notion.so/{target_id_for_url.replace('-', '')}" if target_id_for_url else ""
            
            # Create email content
            html_content = create_email_content(
                vocabulary_items,
                user.first_name,
                database_url,
                column_selection=service.column_selection,
                email_client=service.email_client
            )
            
            # Send email
            subject = f"{service.service_name} - Vocabulary Recall"
            success, error = send_email(user.email, subject, html_content)
            
            if success:
                logger.info(f"Successfully sent email for service {service_id} to {user.email}")
                # Update last_sent_at timestamp
                service.last_sent_at = datetime.utcnow()
                db.session.commit()
            else:
                logger.error(f"Failed to send email for service {service_id}: {error}")
            
            # Log the email
            email_log = EmailLog(
                user_id=user.id,
                vocabulary_items=vocabulary_items,
                status='sent' if success else 'failed',
                error_message=error if not success else None
            )
            db.session.add(email_log)
            db.session.commit()
            
            return success
            
    except Exception as e:
        logger.error(f"Error in send_email_service_task for service {service_id}: {e}", exc_info=True)
        return False


@celery.task
def reload_email_schedules():
    """
    Celery task to reload email service schedules from database.
    This runs periodically to pick up new or updated email services without restarting.
    """
    try:
        with current_app.app_context():
            services = EmailService.query.filter_by(is_active=True).all()
            beat_schedule = {}
            
            for service in services:
                try:
                    # Convert service time from local timezone to UTC
                    # Service stores time in local timezone (e.g., Asia/Shanghai)
                    # Celery Beat schedules in UTC, so we need to convert
                    local_tz = pytz.timezone(service.timezone)
                    utc_tz = pytz.UTC
                    
                    # Create a datetime object for today with the service time
                    today = datetime.now(local_tz).date()
                    local_datetime = local_tz.localize(datetime.combine(today, service.send_time))
                    
                    # Convert to UTC
                    utc_datetime = local_datetime.astimezone(utc_tz)
                    hour = utc_datetime.hour
                    minute = utc_datetime.minute
                    
                    # Create cron schedule based on frequency
                    if service.frequency == 'daily':
                        schedule = crontab(hour=hour, minute=minute)
                    elif service.frequency == 'weekly':
                        schedule = crontab(hour=hour, minute=minute, day_of_week=1)
                    elif service.frequency == 'monthly':
                        schedule = crontab(hour=hour, minute=minute, day_of_month=1)
                    else:
                        continue
                    
                    # Add to beat schedule
                    task_name = f'email-service-{service.id}-{service.service_name}'
                    beat_schedule[task_name] = {
                        'task': 'app.email.send_email_service_task',
                        'schedule': schedule,
                        'args': (service.id,),
                        'options': {'expires': 3600}
                    }
                    
                except Exception as e:
                    logger.error(f"Error scheduling service {service.id}: {e}")
                    continue
            
            # Update Celery Beat configuration
            celery.conf.beat_schedule.update(beat_schedule)
            logger.info(f"Reloaded {len(beat_schedule)} email service schedules")
            return len(beat_schedule)
            
    except Exception as e:
        logger.error(f"Error reloading email schedules: {e}", exc_info=True)
        return 0