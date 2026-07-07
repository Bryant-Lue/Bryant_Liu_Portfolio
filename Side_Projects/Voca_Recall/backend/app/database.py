from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from notion_client import Client
import re
from .models import NotionDatabase, NotionToken, User, db
from .logging_config import get_logger
from .middleware import log_api_call, log_function_call

database_bp = Blueprint('database', __name__)
logger = get_logger(__name__)

@log_function_call("Database ID extraction")
def extract_database_id(input_str: str):
    """Extract and normalize a Notion database ID from a raw ID or URL.

    Supports:
    - Raw 32-char hex ID (with or without dashes)
    - Notion URLs where the last path segment contains the ID
    - Share links that include the UUID anywhere in the string
    """
    if not input_str:
        return None

    logger.debug(f"Extracting database ID from input: {input_str}")

    # 32 hex characters optionally with dashes (UUID)
    uuid_regex = r"([0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})"

    match = re.search(uuid_regex, input_str)
    if not match:
        logger.warning(f"Could not extract database ID from input: {input_str}")
        return None

    raw_id = match.group(1)
    normalized = raw_id.replace('-', '').lower()
    logger.debug(f"Extracted database ID: {normalized}")
    return normalized

@log_function_call("Notion database validation")
def validate_notion_database(api_key, database_id):
    """Validate Notion database access"""
    try:
        logger.info(f"Validating Notion database access for database {database_id}")
        
        notion = Client(auth=api_key)
        # We try to validate using data_sources if available, or databases as fallback
        try:
            database = notion.data_sources.retrieve(database_id)
        except Exception:
            # Fallback to databases retrieve
            database = notion.databases.retrieve(database_id)
        
        title = database.get('title', [{}])[0].get('plain_text', 'Untitled Database')
        logger.info(f"Successfully validated database: {title}")
        
        return True, title
    except Exception as e:
        logger.error(f"Failed to validate Notion database {database_id}: {str(e)}")
        return False, str(e)

@database_bp.route('/', methods=['POST'])
@database_bp.route('', methods=['POST'])
@jwt_required()
@log_api_call("Add Notion database")
def add_database():
    """Add a new Notion database.

    Requires: notion_api_key (integration token) or token_id, and database_url or database_id.
    We always connect/validate using the database ID, not the URL.
    """
    try:
        current_user_id = int(get_jwt_identity())
        data = request.get_json() or {}

        # Get API key either from direct input or from stored token
        api_key = data.get('notion_api_key')
        token_id = data.get('token_id')
        
        if not api_key and not token_id:
            return jsonify({'error': 'Integration Token (notion_api_key) or token_id is required'}), 400
        
        # If token_id provided, fetch the token
        notion_token = None
        if token_id:
            notion_token = NotionToken.query.filter_by(
                id=token_id,
                user_id=current_user_id,
                is_active=True
            ).first()
            if not notion_token:
                return jsonify({'error': 'Token not found or inactive'}), 404
            api_key = notion_token.token

        # Accept either explicit data_source_id, database_id, or a URL
        provided_id = data.get('data_source_id') or data.get('database_id')
        database_url = data.get('database_url')

        # Keep URL optional now, favor ID
        if not provided_id and not database_url:
            return jsonify({'error': 'Provide a Data Source ID, Database ID, or URL'}), 400

        data_source_id = extract_database_id(provided_id or database_url)
        if not data_source_id:
            return jsonify({'error': 'Could not extract a valid ID'}), 400

        # Check if database already exists for this user
        existing_db = NotionDatabase.query.filter_by(
            user_id=current_user_id,
            database_id=data_source_id  # Checking against legacy database_id field
        ).first() or NotionDatabase.query.filter_by(
            user_id=current_user_id,
            data_source_id=data_source_id
        ).first()
        if existing_db:
            return jsonify({'error': 'This data source is already connected'}), 409

        # Validate access and get the actual database title using the token
        is_valid, result = validate_notion_database(api_key, data_source_id)
        if not is_valid:
            return jsonify({'error': 'Failed to validate Notion database', 'details': result}), 400
        database_name = result or 'Untitled Database'

        # If a new token was provided (not token_id), store it
        if data.get('notion_api_key') and not token_id:
            notion_token = NotionToken(
                user_id=current_user_id,
                token=api_key,
                token_name=data.get('token_name', 'Default Token')
            )
            db.session.add(notion_token)
            db.session.flush()  # Get the token ID

        # Use provided URL if available, otherwise store a minimal URL-like reference
        stored_url = database_url or f"https://www.notion.so/{data_source_id}"

        notion_db = NotionDatabase(
            user_id=current_user_id,
            database_id=data_source_id, # Retaining in database_id for backward compatibility
            data_source_id=data_source_id,
            database_name=database_name,
            database_url=stored_url,
            token_id=notion_token.id if notion_token else None
        )

        db.session.add(notion_db)
        db.session.commit()

        return jsonify({
            'message': 'Database added successfully',
            'database': notion_db.to_dict(),
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to add database', 'details': str(e)}), 500

@database_bp.route('/', methods=['GET'])
@database_bp.route('', methods=['GET'])
@jwt_required()
def get_databases():
    """Get user's Notion databases"""
    try:
        current_user_id = int(get_jwt_identity())
        databases = NotionDatabase.query.filter_by(user_id=current_user_id).all()
        
        return jsonify({
            'databases': [db.to_dict() for db in databases]
        }), 200
        
    except Exception as e:
        return jsonify({'error': 'Failed to get databases', 'details': str(e)}), 500

@database_bp.route('/<int:database_id>', methods=['GET'])
@jwt_required()
def get_database(database_id):
    """Get specific database details"""
    try:
        current_user_id = int(get_jwt_identity())
        database = NotionDatabase.query.filter_by(
            id=database_id, 
            user_id=current_user_id
        ).first()
        
        if not database:
            return jsonify({'error': 'Database not found'}), 404
        
        return jsonify({
            'database': database.to_dict()
        }), 200
        
    except Exception as e:
        return jsonify({'error': 'Failed to get database', 'details': str(e)}), 500

@database_bp.route('/<int:database_pk>', methods=['PUT'])
@jwt_required()
def update_database(database_pk):
    """Update database details.

    Supports updating:
    - is_active flag
    - database_url (and consequently database_id + database_name), requires notion_api_key or token_id
    """
    try:
        current_user_id = int(get_jwt_identity())
        database = NotionDatabase.query.filter_by(
            id=database_pk,
            user_id=current_user_id,
        ).first()

        if not database:
            return jsonify({'error': 'Database not found'}), 404

        data = request.get_json() or {}

        # Toggle active status
        if data.get('is_active') is not None:
            database.is_active = bool(data['is_active'])

        # If database_url is provided, re-extract ID and validate with token
        if data.get('database_url') or data.get('database_id') or data.get('data_source_id'):
            # Get API key either from direct input or from stored token
            api_key = data.get('notion_api_key')
            token_id = data.get('token_id')
            
            if not api_key and not token_id:
                return jsonify({'error': 'Integration Token or token_id is required when changing data source'}), 400
            
            # If token_id provided, fetch the token
            if token_id:
                notion_token = NotionToken.query.filter_by(
                    id=token_id,
                    user_id=current_user_id,
                    is_active=True
                ).first()
                if not notion_token:
                    return jsonify({'error': 'Token not found or inactive'}), 404
                api_key = notion_token.token
                database.token_id = token_id

            new_id = extract_database_id(data.get('data_source_id') or data.get('database_id') or data.get('database_url'))
            if not new_id:
                return jsonify({'error': 'Could not extract a valid Data Source ID'}), 400

            # Check duplicate for this user
            duplicate = NotionDatabase.query.filter(
                NotionDatabase.user_id == current_user_id,
                NotionDatabase.database_id == new_id,
                NotionDatabase.id != database.id,
            ).first()
            if duplicate:
                return jsonify({'error': 'Another entry already uses this database'}), 409

            # Validate access and get title
            is_valid, result = validate_notion_database(api_key, new_id)
            if not is_valid:
                return jsonify({'error': 'Failed to validate Notion data source', 'details': result}), 400

            database.database_id = new_id
            database.data_source_id = new_id
            database.database_name = result or 'Untitled Database'
            if data.get('database_url'):
                database.database_url = data['database_url']
            
            # Store new token if provided directly
            if data.get('notion_api_key') and not token_id:
                notion_token = NotionToken(
                    user_id=current_user_id,
                    token=api_key,
                    token_name=data.get('token_name', 'Default Token')
                )
                db.session.add(notion_token)
                db.session.flush()
                database.token_id = notion_token.id

        db.session.commit()

        return jsonify({
            'message': 'Database updated successfully',
            'database': database.to_dict(),
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to update database', 'details': str(e)}), 500

@database_bp.route('/<int:database_id>', methods=['DELETE'])
@jwt_required()
def delete_database(database_id):
    """Delete a database"""
    try:
        current_user_id = int(get_jwt_identity())
        database = NotionDatabase.query.filter_by(
            id=database_id, 
            user_id=current_user_id
        ).first()
        
        if not database:
            return jsonify({'error': 'Database not found'}), 404
        
        db.session.delete(database)
        db.session.commit()
        
        return jsonify({
            'message': 'Database deleted successfully'
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to delete database', 'details': str(e)}), 500

@database_bp.route('/<int:database_id>/test', methods=['POST'])
@jwt_required()
def test_database_connection(database_id):
    """Test database connection and get sample data"""
    try:
        current_user_id = int(get_jwt_identity())
        database = NotionDatabase.query.filter_by(
            id=database_id, 
            user_id=current_user_id
        ).first()
        
        if not database:
            return jsonify({'error': 'Database not found'}), 404
        
        data = request.get_json() or {}
        api_key = data.get('notion_api_key')
        
        # If API key not provided, use stored token
        if not api_key:
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
        
        # Test connection and get sample data
        is_valid, result = validate_notion_database(api_key, database.database_id)
        
        if not is_valid:
            return jsonify({'error': 'Failed to connect to database', 'details': result}), 400
        
        # Get sample data (first few items)
        try:
            notion = Client(auth=api_key)
            response = notion.databases.query(
                database_id=database.database_id,
                page_size=5
            )
            
            sample_items = []
            for item in response.get('results', []):
                # Extract properties (this is a simplified version)
                properties = item.get('properties', {})
                item_data = {}
                for prop_name, prop_value in properties.items():
                    if prop_value.get('type') == 'title':
                        title = prop_value.get('title', [])
                        item_data[prop_name] = title[0].get('plain_text', '') if title else ''
                    elif prop_value.get('type') == 'rich_text':
                        rich_text = prop_value.get('rich_text', [])
                        item_data[prop_name] = rich_text[0].get('plain_text', '') if rich_text else ''
                
                sample_items.append(item_data)
            
            return jsonify({
                'message': 'Connection successful',
                'database_name': result,
                'sample_items': sample_items,
                'total_items': len(response.get('results', []))
            }), 200
            
        except Exception as e:
            return jsonify({'error': 'Failed to fetch sample data', 'details': str(e)}), 500
        
    except Exception as e:
        return jsonify({'error': 'Failed to test connection', 'details': str(e)}), 500


# Token Management Endpoints

@database_bp.route('/tokens', methods=['GET'])
@jwt_required()
@log_api_call("Get Notion tokens")
def get_tokens():
    """Get user's stored Notion tokens"""
    try:
        current_user_id = int(get_jwt_identity())
        tokens = NotionToken.query.filter_by(user_id=current_user_id).all()
        
        return jsonify({
            'tokens': [token.to_dict(include_token=False) for token in tokens]
        }), 200
        
    except Exception as e:
        return jsonify({'error': 'Failed to get tokens', 'details': str(e)}), 500


@database_bp.route('/tokens', methods=['POST'])
@jwt_required()
@log_api_call("Add Notion token")
def add_token():
    """Add a new Notion token"""
    try:
        current_user_id = int(get_jwt_identity())
        data = request.get_json() or {}
        
        token = data.get('notion_api_key')
        if not token:
            return jsonify({'error': 'notion_api_key is required'}), 400
        
        token_name = data.get('token_name', 'My Token')
        
        # Check if token already exists for this user
        existing_token = NotionToken.query.filter_by(
            user_id=current_user_id,
            token=token
        ).first()
        
        if existing_token:
            return jsonify({'error': 'This token is already stored'}), 409
        
        # Optionally validate the token by trying to list databases (requires API call)
        # For now, we'll just store it
        
        notion_token = NotionToken(
            user_id=current_user_id,
            token=token,
            token_name=token_name
        )
        
        db.session.add(notion_token)
        db.session.commit()
        
        return jsonify({
            'message': 'Token added successfully',
            'token': notion_token.to_dict(include_token=False)
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to add token', 'details': str(e)}), 500


@database_bp.route('/tokens/<int:token_id>', methods=['PUT'])
@jwt_required()
@log_api_call("Update Notion token")
def update_token(token_id):
    """Update a Notion token"""
    try:
        current_user_id = int(get_jwt_identity())
        token = NotionToken.query.filter_by(
            id=token_id,
            user_id=current_user_id
        ).first()
        
        if not token:
            return jsonify({'error': 'Token not found'}), 404
        
        data = request.get_json() or {}
        
        if data.get('token_name'):
            token.token_name = data['token_name']
        
        if data.get('is_active') is not None:
            token.is_active = bool(data['is_active'])
        
        db.session.commit()
        
        return jsonify({
            'message': 'Token updated successfully',
            'token': token.to_dict(include_token=False)
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to update token', 'details': str(e)}), 500


@database_bp.route('/tokens/<int:token_id>', methods=['DELETE'])
@jwt_required()
@log_api_call("Delete Notion token")
def delete_token(token_id):
    """Delete a Notion token"""
    try:
        current_user_id = int(get_jwt_identity())
        token = NotionToken.query.filter_by(
            id=token_id,
            user_id=current_user_id
        ).first()
        
        if not token:
            return jsonify({'error': 'Token not found'}), 404
        
        # Check if any databases are using this token
        using_databases = NotionDatabase.query.filter_by(token_id=token_id).count()
        
        if using_databases > 0:
            return jsonify({
                'error': f'Cannot delete token. {using_databases} database(s) are using this token. Please reassign them first.'
            }), 400
        
        db.session.delete(token)
        db.session.commit()
        
        return jsonify({
            'message': 'Token deleted successfully'
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to delete token', 'details': str(e)}), 500 
    
@database_bp.route('/<int:database_id>/properties', methods=['GET'])
@jwt_required()
@log_api_call("Get database properties")
def get_database_properties(database_id):
    """Get the properties (columns) of a Notion database"""
    try:
        current_user_id = int(get_jwt_identity())
        
        # Verify database belongs to user
        database = NotionDatabase.query.filter_by(
            id=database_id,
            user_id=current_user_id
        ).first()
        
        if not database:
            return jsonify({'error': 'Database not found or not authorized'}), 404
            
        # Get token
        if not database.token_id:
             return jsonify({'error': 'Database has no linked token'}), 400
             
        token = NotionToken.query.get(database.token_id)
        if not token or not token.is_active:
             return jsonify({'error': 'Token not found or inactive'}), 400
             
        # Fetch properties from Notion
        notion = Client(auth=token.token)
        # Using retrieve to get database properties schema
        db_info = notion.databases.retrieve(database.database_id)
        properties = db_info.get('properties', {})
        
        # Format properties list
        columns = []
        for name, prop in properties.items():
            columns.append({
                'name': name,
                'type': prop.get('type')
            })
            
        return jsonify({'columns': columns}), 200
        
    except Exception as e:
        logger.error(f"Failed to get database properties: {str(e)}")
        return jsonify({'error': 'Failed to get database properties', 'details': str(e)}), 500
