ALTER TABLE password_credentials
  DROP CONSTRAINT password_credentials_password_scrypt_check;

ALTER TABLE password_credentials
  ADD CONSTRAINT password_credentials_password_scrypt_check
  CHECK (
    password_scrypt ~ '^scrypt[$]v1[$][a-f0-9]{32,128}[$][a-f0-9]{128}$'
  );
