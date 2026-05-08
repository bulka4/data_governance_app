-- code for finding all the tables containing sensitive information

IF OBJECT_ID ('tempdb..#GDPRResults') IS NOT NULL DROP TABLE #GDPRResults
CREATE TABLE #GDPRResults (
    ServerName NVARCHAR(255),
    DatabaseName NVARCHAR(255),
    TABLE_CATALOG NVARCHAR(255),
    TABLE_SCHEMA NVARCHAR(255),
    TABLE_NAME NVARCHAR(255),
    COLUMN_NAME NVARCHAR(255),
    DATA_TYPE NVARCHAR(255),
    CHARACTER_MAXIMUM_LENGTH INT,
    GDPR_Category NVARCHAR(255)
);

DECLARE @DBName NVARCHAR(255);
DECLARE @SQL NVARCHAR(MAX);
DECLARE @ServerName NVARCHAR(255) = @@SERVERNAME;

DECLARE db_cursor CURSOR FOR
SELECT name FROM sys.databases
WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb');

OPEN db_cursor;
FETCH NEXT FROM db_cursor INTO @DBName;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @SQL = N'
    INSERT INTO #GDPRResults
    SELECT 
           ''' + @ServerName + ''' AS ServerName,
           ''' + @DBName + ''' AS DatabaseName, 
           C.TABLE_CATALOG, 
           C.TABLE_SCHEMA, 
           C.TABLE_NAME, 
           C.COLUMN_NAME, 
           C.DATA_TYPE, 
           C.CHARACTER_MAXIMUM_LENGTH,
           CASE
               WHEN C.COLUMN_NAME LIKE ''%surname%'' 
                    OR C.COLUMN_NAME LIKE ''%last_name%'' 
                    OR C.COLUMN_NAME LIKE ''%last-name%'' 
                    OR C.COLUMN_NAME LIKE ''%last name%'' 
                    OR C.COLUMN_NAME LIKE ''%lastname%'' THEN ''Surname''
               WHEN C.COLUMN_NAME LIKE ''%first%name%'' 
                    OR C.COLUMN_NAME LIKE ''%first_name%'' 
                    OR C.COLUMN_NAME LIKE ''%first-name%'' 
                    OR C.COLUMN_NAME LIKE ''%first name%'' 
                    OR C.COLUMN_NAME LIKE ''%firstname%'' THEN ''First Name''
               WHEN C.COLUMN_NAME LIKE ''%email%'' THEN ''Email''
               WHEN C.COLUMN_NAME LIKE ''%phone%'' OR C.COLUMN_NAME LIKE ''%mobile%'' THEN ''Phone Number''
               WHEN C.COLUMN_NAME LIKE ''%address%'' THEN ''Address''
               WHEN C.COLUMN_NAME LIKE ''%birth%'' OR C.COLUMN_NAME LIKE ''%dob%'' THEN ''Date of Birth''
               WHEN C.COLUMN_NAME LIKE ''%ssn%'' OR C.COLUMN_NAME LIKE ''%social%'' THEN ''Social Security Number''
               WHEN C.COLUMN_NAME LIKE ''%id%'' OR C.COLUMN_NAME LIKE ''%ident%'' THEN ''ID Number''
               WHEN C.COLUMN_NAME LIKE ''%passport%'' THEN ''Passport Number''
               WHEN C.COLUMN_NAME LIKE ''%comments%'' OR C.COLUMN_NAME LIKE ''%description%'' 
                     OR C.COLUMN_NAME LIKE ''%notes%'' OR C.COLUMN_NAME LIKE ''%remarks%'' 
                     OR C.COLUMN_NAME LIKE ''%message%'' 
                     OR (C.DATA_TYPE IN (''NVARCHAR'', ''VARCHAR'', ''TEXT'') AND (C.CHARACTER_MAXIMUM_LENGTH IS NULL OR C.CHARACTER_MAXIMUM_LENGTH > 255))
                     THEN ''Freeform Text''
               ELSE ''Other Potential GDPR Field''
           END AS GDPR_Category
    FROM [' + @DBName + '].INFORMATION_SCHEMA.COLUMNS C
    WHERE C.COLUMN_NAME LIKE ''%surname%''
       OR C.COLUMN_NAME LIKE ''%last_name%''
       OR C.COLUMN_NAME LIKE ''%last-name%''
       OR C.COLUMN_NAME LIKE ''%last name%''
       OR C.COLUMN_NAME LIKE ''%lastname%''
       OR C.COLUMN_NAME LIKE ''%first%name%''
       OR C.COLUMN_NAME LIKE ''%first_name%''
       OR C.COLUMN_NAME LIKE ''%first-name%''
       OR C.COLUMN_NAME LIKE ''%first name%''
       OR C.COLUMN_NAME LIKE ''%firstname%''
       OR C.COLUMN_NAME LIKE ''%email%''
       OR C.COLUMN_NAME LIKE ''%phone%''
       OR C.COLUMN_NAME LIKE ''%mobile%''
       OR C.COLUMN_NAME LIKE ''%address%''
       OR C.COLUMN_NAME LIKE ''%birth%''
       OR C.COLUMN_NAME LIKE ''%dob%''
       OR C.COLUMN_NAME LIKE ''%ssn%''
       OR C.COLUMN_NAME LIKE ''%social%''
       OR C.COLUMN_NAME LIKE ''%id%''
       OR C.COLUMN_NAME LIKE ''%ident%''
       OR C.COLUMN_NAME LIKE ''%passport%''
       OR C.COLUMN_NAME LIKE ''%comments%''
       OR C.COLUMN_NAME LIKE ''%description%''
       OR C.COLUMN_NAME LIKE ''%notes%''
       OR C.COLUMN_NAME LIKE ''%remarks%''
       OR C.COLUMN_NAME LIKE ''%message%''
       OR (C.DATA_TYPE IN (''NVARCHAR'', ''VARCHAR'', ''TEXT'') AND (C.CHARACTER_MAXIMUM_LENGTH IS NULL OR C.CHARACTER_MAXIMUM_LENGTH > 255));';

    EXEC sp_executesql @SQL;

    FETCH NEXT FROM db_cursor INTO @DBName;
END

CLOSE db_cursor;
DEALLOCATE db_cursor;

SELECT * FROM #GDPRResults;
