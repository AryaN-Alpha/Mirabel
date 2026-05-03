import pymysql

# Satisfy Django's mysqlclient >= 2.2.1 version guard while using PyMySQL.
pymysql.version_info = (2, 2, 2, "final", 0)
pymysql.__version__ = "2.2.2"
pymysql.install_as_MySQLdb()
