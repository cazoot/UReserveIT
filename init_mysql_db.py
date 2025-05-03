import os
import pymysql
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database connection parameters
mysql_user = os.environ.get("MYSQL_USER", "root")
mysql_password = os.environ.get("MYSQL_PASSWORD", "password")
mysql_host = os.environ.get("MYSQL_HOST", "localhost")
mysql_port = int(os.environ.get("MYSQL_PORT", "3306"))
mysql_database = os.environ.get("MYSQL_DATABASE", "lrc_reservations")

def create_database():
    # Connect to MySQL server without specifying a database
    logger.info(f"Connecting to MySQL server at {mysql_host}:{mysql_port}")
    try:
        connection = pymysql.connect(
            host=mysql_host,
            user=mysql_user,
            password=mysql_password,
            port=mysql_port
        )
        
        with connection.cursor() as cursor:
            # Create database if it doesn't exist
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS {mysql_database}")
            logger.info(f"Database '{mysql_database}' created or already exists")
            
            # Grant privileges to the user
            cursor.execute(f"GRANT ALL PRIVILEGES ON {mysql_database}.* TO '{mysql_user}'@'%'")
            cursor.execute("FLUSH PRIVILEGES")
            logger.info(f"Privileges granted to user '{mysql_user}'")
            
        connection.close()
        logger.info("Database initialization completed successfully")
        return True
    except Exception as e:
        logger.error(f"Error creating database: {e}")
        return False

if __name__ == "__main__":
    create_database()